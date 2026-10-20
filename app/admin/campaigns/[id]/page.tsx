import { notFound } from "next/navigation";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, recipients } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import TestEmailForm from "@/components/TestEmailForm";
import EditCampaignForm from "@/components/EditCampaignForm";
import CampaignSendControls from "@/components/CampaignSendControls";
import CampaignProviderStatus from "@/components/CampaignProviderStatus";
import CampaignDetailTabs from "@/components/CampaignDetailTabs";

const PAGE_SIZE = 25;

type CampaignTab = "manage" | "preview" | "recipients";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; tab?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const requestedPage = Number(query.page || "1");
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  const initialTab: CampaignTab = query.tab === "preview" || query.tab === "recipients" ? query.tab : "manage";
  await ensureDatabase();
  const campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  if (!campaign) notFound();
  const total = (await db.select({ value: count() }).from(recipients).where(eq(recipients.campaignId, id)))[0]?.value || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const people = await db.select().from(recipients).where(eq(recipients.campaignId, id)).orderBy(desc(recipients.createdAt)).limit(PAGE_SIZE).offset((currentPage - 1) * PAGE_SIZE);

  const management = <>
    <CampaignProviderStatus campaignId={id} />
    <CampaignSendControls campaignId={id} initialStatus={campaign.sendStatus as "draft" | "sending" | "paused" | "stopped" | "completed"} initialCursor={campaign.sendCursor} total={campaign.recipientCount} />
    <EditCampaignForm campaign={campaign} />
    <section className="panel"><h2>Gửi email test</h2><p className="sub">MVP gửi test tới email bạn nhập, không ảnh hưởng hàng đợi campaign.</p><TestEmailForm campaignId={id} /></section>
  </>;

  const preview = <section className="panel"><h2>Preview HTML</h2><div className="mono">{campaign.htmlContent}</div></section>;

  const importedRecipients = <section className="panel"><h2>Recipients đã import ({total})</h2><div className="tablewrap"><table className="table"><thead><tr><th>Email</th><th>Name</th><th>Status</th></tr></thead><tbody>{people.length ? people.map((person) => <tr key={person.id}><td>{person.email}</td><td>{person.name || "—"}</td><td><span className={`pill ${person.status === "failed" ? "pill-danger" : ""}`}>{person.status}</span></td></tr>) : <tr><td colSpan={3}>Chưa có email.</td></tr>}</tbody></table></div><div className="pagination"><span>Trang {currentPage} / {totalPages}</span><div className="pagination-actions">{currentPage > 1 ? <a className="button secondary" href={`/admin/campaigns/${id}?page=${currentPage - 1}&tab=recipients`}>← Trước</a> : <span className="button secondary disabled">← Trước</span>}{currentPage < totalPages ? <a className="button secondary" href={`/admin/campaigns/${id}?page=${currentPage + 1}&tab=recipients`}>Sau →</a> : <span className="button secondary disabled">Sau →</span>}</div></div></section>;

  return <>
    <a className="button secondary campaign-back-link" href="/admin/campaigns/new?tab=list" aria-label="Quay lại danh sách campaigns"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7 7-7-7 7-7" /></svg>Danh sách campaigns</a>
    <div className="eyebrow">Campaign detail</div>
    <h1 className="title">{campaign.name}</h1>
    <p className="sub">{campaign.subject}</p>
    <div className="metricrow"><div className="metric"><span className="eyebrow">Recipients</span><b>{campaign.recipientCount}</b></div><div className="metric"><span className="eyebrow">Created</span><b style={{ fontSize: 16 }}>{new Date(campaign.createdAt).toLocaleDateString("vi-VN")}</b></div><div className="metric"><span className="eyebrow">Status</span><b style={{ fontSize: 16 }}>{campaign.sendStatus === "sending" ? "Đang gửi" : campaign.sendStatus === "paused" ? "Tạm dừng" : campaign.sendStatus === "completed" ? "Hoàn tất" : campaign.sendStatus === "stopped" ? "Đã dừng" : "Sẵn sàng"}</b></div></div>
    <CampaignDetailTabs initialTab={initialTab} management={management} preview={preview} recipients={importedRecipients} />
  </>;
}
