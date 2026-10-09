import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/db/client";
import { campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { z } from "zod";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){const session=await auth();if(!isAdminEmail(session?.user?.email))return NextResponse.json({error:"Unauthorized"},{status:401});const {id}=await params;const body=z.object({to:z.string().email()}).safeParse(await req.json());if(!body.success)return NextResponse.json({error:"Email không hợp lệ"},{status:400});const campaign=(await db.select().from(campaigns).where(eq(campaigns.id,id)).limit(1))[0];if(!campaign)return NextResponse.json({error:"Campaign not found"},{status:404});if(!process.env.RESEND_API_KEY)return NextResponse.json({error:"Thiếu RESEND_API_KEY"},{status:500});const resend=new Resend(process.env.RESEND_API_KEY);const result=await resend.emails.send({from:process.env.EMAIL_FROM||"onboarding@resend.dev",to:body.data.to,subject:`[TEST] ${campaign.subject}`,html:campaign.htmlContent,text:campaign.textContent});if(result.error)return NextResponse.json({error:result.error.message},{status:400});return NextResponse.json({id:result.data?.id});}
