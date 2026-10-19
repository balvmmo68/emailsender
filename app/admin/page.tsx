import { auth } from "@/auth";
import { db, ensureDatabase } from "@/db/client";
import { campaigns, emailSettings } from "@/db/schema";
import { getConfiguredProviderDailyCapacity } from "@/lib/daily-email-capacity";
import { desc, eq } from "drizzle-orm";

const numberFormat = new Intl.NumberFormat("vi-VN");

export default async function AdminPage() {
  const session = await auth();
  let rows: Array<typeof campaigns.$inferSelect> = [];
  let databaseError = false;
  let capacity = { total: 0, providers: [] as Array<{ name: string; dailyLimit: number }> };

  try {
    await ensureDatabase();
    rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(20);
    const settings = (await db.select().from(emailSettings).where(eq(emailSettings.id, 1)).limit(1))[0];
    capacity = getConfiguredProviderDailyCapacity(settings?.providerConfigsJson);
  } catch (error) {
    databaseError = true;
    console.error("[admin] Không thể khởi tạo/đọc database:", error);
  }

  return <>
    <div className="eyebrow">Admin workspace</div>
    <h1 className="title">Email campaigns, rõ ràng và kiểm soát.</h1>
    <p className="sub">Xin chào {session?.user?.name || "admin"}. Tạo campaign từ CSV, soạn nội dung, rồi gửi email test.</p>
    {databaseError && <div className="notice error">Chưa kết nối được database. Hãy kiểm tra <code>TURSO_DATABASE_URL</code> và <code>TURSO_AUTH_TOKEN</code>.</div>}

    <div className="metricrow">
      <div className="metric"><span className="eyebrow">Campaigns</span><b>{rows.length}</b></div>
      <div className="metric"><span className="eyebrow">Provider sẵn sàng</span><b>{capacity.providers.length}</b></div>
      <div className="metric"><span className="eyebrow">Hạn mức email/ngày</span><b>{numberFormat.format(capacity.total)}</b></div>
      <div className="metric"><span className="eyebrow">Access</span><b>Admin only</b></div>
    </div>

    <section className="panel" style={{ marginTop: 22 }}>
      <div className="toolbar">
        <div>
          <h2>Tổng hạn mức gửi trong ngày</h2>
          <p className="sub">{numberFormat.format(capacity.total)} email/ngày, cộng từ {capacity.providers.length} provider đã cấu hình đủ biến môi trường.</p>
        </div>
        <a className="button secondary" href="/admin/settings">Quản lý provider</a>
      </div>
      {capacity.providers.length ? <div className="actions" style={{ marginTop: 14 }}>
        {capacity.providers.map((provider) => <span className="pill" key={provider.name}>{provider.name}: {numberFormat.format(provider.dailyLimit)}/ngày</span>)}
      </div> : <p className="sub">Chưa có provider gửi email nào được cấu hình đầy đủ.</p>}
      <p className="sub" style={{ marginTop: 14, marginBottom: 0 }}>Đây là tổng hạn mức cấu hình trong ứng dụng. Giới hạn thực tế còn phụ thuộc vào gói và trạng thái tài khoản của từng nhà cung cấp.</p>
    </section>

    <div className="toolbar" style={{ marginTop: 34 }}>
      <h2>Campaign gần đây</h2>
      <a className="button" href="/admin/campaigns/new">+ Tạo campaign</a>
    </div>
    <section className="panel">
      <div className="tablewrap">
        <table className="table">
          <thead><tr><th>Tên</th><th>Subject</th><th>Recipients</th><th>Ngày tạo</th></tr></thead>
          <tbody>{rows.length ? rows.map((row) => <tr key={row.id}>
            <td><a href={`/admin/campaigns/${row.id}`}><b>{row.name}</b></a></td>
            <td>{row.subject}</td>
            <td><span className="pill">{row.recipientCount}</span></td>
            <td>{new Date(row.createdAt).toLocaleString("vi-VN")}</td>
          </tr>) : <tr><td colSpan={4}>{databaseError ? "Chưa thể tải campaign do database chưa sẵn sàng." : "Chưa có campaign. Hãy tạo campaign đầu tiên."}</td></tr>}</tbody>
        </table>
      </div>
    </section>
  </>;
}
