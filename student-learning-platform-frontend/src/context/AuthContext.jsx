import {createContext,useCallback,useContext,useEffect,useMemo,useState} from "react";
import {authApi} from "../lib/api";
const Ctx=createContext(null);
export function AuthProvider({children}){
 const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem("slp_user")||"null")}catch{return null}});
 const [loading,setLoading]=useState(Boolean(localStorage.getItem("slp_access_token")));
 const saveSession=useCallback(p=>{localStorage.setItem("slp_access_token",p.accessToken);localStorage.setItem("slp_user",JSON.stringify(p.user));setUser(p.user)},[]);
 const logout=useCallback(async()=>{try{await authApi.logout()}catch{}localStorage.removeItem("slp_access_token");localStorage.removeItem("slp_user");setUser(null)},[]);
 useEffect(()=>{let alive=true;const expire=()=>{localStorage.removeItem("slp_access_token");localStorage.removeItem("slp_user");if(alive)setUser(null)};window.addEventListener("slp:session-expired",expire);if(!localStorage.getItem("slp_access_token")){setLoading(false);return()=>{alive=false;window.removeEventListener("slp:session-expired",expire)}}authApi.me().then(r=>{if(alive){setUser(r.user);localStorage.setItem("slp_user",JSON.stringify(r.user))}}).catch(error=>{if(error.status===401||error.code==="SESSION_EXPIRED")expire()}).finally(()=>alive&&setLoading(false));return()=>{alive=false;window.removeEventListener("slp:session-expired",expire)}},[]);
 const value=useMemo(()=>({user,loading,isAuthenticated:!!user,saveSession,logout}),[user,loading,saveSession,logout]);
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth(){const c=useContext(Ctx);if(!c)throw new Error("useAuth requires AuthProvider");return c}
