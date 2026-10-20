"use client";
import { signIn } from "next-auth/react";
export default function LoginButton(){return <button className="button" onClick={()=>signIn("google",{callbackUrl:"/admin"})}>Sign in with Google</button>}
