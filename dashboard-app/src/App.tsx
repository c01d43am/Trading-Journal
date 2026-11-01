import { Navigate, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { LockScreen } from "./pages/LockScreen";
import { ProfileForm } from "./pages/ProfileForm";
import { ProfileList } from "./pages/ProfileList";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProfileList />} />
      <Route path="/profile/new" element={<ProfileForm />} />
      <Route path="/profile/unlock/:id" element={<LockScreen />} />
      <Route path="/profile/:id" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
