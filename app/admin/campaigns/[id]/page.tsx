import { notFound } from "next/navigation";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, recipients } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import TestEmailForm from "@/components/TestEmailForm";
import EditCampaignForm from "@/components/EditCampaignForm";

const PAGE_SIZE = 25;

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const requestedPage = Number(query.page || "1");
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  await ensureDatabase();
  const campaign = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  if (!campaign) notFound();
  const total = (await db.select({ value: count() }).from(recipients).where(eq(recipients.campaignId, id)))[0]?.value || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const people = await db.select().from(recipients).where(eq(recipients.campaignId, id)).orderBy(desc(recipients.createdAt)).limit(PAGE_SIZE).offset((currentPage - 1) * PAGE_SIZE);
  return <><div className="eyebrow">Campaign detail</div><h1 className="title">{campaign.name}</h1><p className="sub">{campaign.subject}</p><div className="metricrow"><div className="metric"><span className="eyebrow">Recipients</span><b>{campaign.recipientCount}</b></div><div className="metric"><span className="eyebrow">Created</span><b style={{ fontSize: 16 }}>{new Date(campaign.createdAt).toLocaleDateString("vi-VN")}</b></div><div className="metric"><span className="eyebrow">Status</span><b style={{ fontSize: 16 }}>Draft / test</b></div></div><EditCampaignForm campaign={campaign} /><section className="panel"><h2>Gửi email test</h2><p className="sub">MVP chỉ gửi test tới email bạn nhập, chưa gửi hàng loạt.</p><TestEmailForm campaignId={id} /></section><section className="panel"><h2>Preview HTML</h2><div className="mono">{campaign.htmlContent}</div></section><section className="panel"><h2>Recipients đã import ({total})</h2><div className="tablewrap"><table className="table"><thead><tr><th>Email</th><th>Name</th><th>Status</th></tr></thead><tbody>{people.length ? people.map(p => <tr key={p.id}><td>{p.email}</td><td>{p.name || "—"}</td><td><span className="pill">{p.status}</span></td></tr>) : <tr><td colSpan={3}>Chưa có email.</td></tr>}</tbody></table></div><div className="pagination"><span>Trang {currentPage} / {totalPages}</span><div className="pagination-actions">{currentPage > 1 ? <a className="button secondary" href={`/admin/campaigns/${id}?page=${currentPage - 1}`}>← Trước</a> : <span className="button secondary disabled">← Trước</span>}{currentPage < totalPages ? <a className="button secondary" href={`/admin/campaigns/${id}?page=${currentPage + 1}`}>Sau →</a> : <span className="button secondary disabled">Sau →</span>}</div></div></section></>;
}
