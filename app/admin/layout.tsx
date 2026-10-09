import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import SidebarToggle from "@/components/SidebarToggle";

export default async function AdminLayout({children}:{children:React.ReactNode}){const session=await auth();if(!session?.user?.email||!isAdminEmail(session.user.email))redirect("/login");return <div className="shell"><aside className="sidebar" id="main-sidebar"><div className="brand">Sendroom<small>campaign console</small></div><nav className="nav"><Link className="active" href="/admin">Tổng quan</Link><Link href="/admin/campaigns/new">Tạo campaign</Link></nav><div className="side-note">MVP an toàn: hiện chỉ gửi email test. Hãy thêm queue và suppression list trước khi gửi số lượng lớn.</div></aside><main className="main"><div className="toolbar"><div className="toolbar-start"><SidebarToggle/><div className="userbar">{session.user.email}</div></div><LogoutButton/></div>{children}</main></div>}
