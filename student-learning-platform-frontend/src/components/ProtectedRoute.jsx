import {Navigate,Outlet,useLocation} from "react-router-dom";
import {useAuth} from "../context/AuthContext";
import {Spinner} from "./UI";
export default function ProtectedRoute({roles}){const {isAuthenticated,loading,user}=useAuth(),loc=useLocation();if(loading)return <Spinner label="Checking your session..."/>;if(!isAuthenticated)return <Navigate to="/login" replace state={{from:loc}}/>;if(roles&&!roles.includes(user?.role))return <Navigate to="/dashboard" replace/>;return <Outlet/>}
