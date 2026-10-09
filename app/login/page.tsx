import LoginButton from "@/components/LoginButton";
import { ADMIN_EMAILS } from "@/lib/admin";

export default function LoginPage(){return <main className="login"><section className="loginbox"><div className="eyebrow">Private console</div><div className="loginmark">Sendroom</div><p className="sub">Bảng điều khiển campaign email dành cho admin.</p><div className="notice">Các tài khoản Google được phép truy cập: <b>{ADMIN_EMAILS.join(", ")}</b>.</div><div className="actions"><LoginButton/></div></section></main>}
