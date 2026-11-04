import { NavLink } from "react-router-dom";
import "./PatientAccountNavigation.css";

const accountLinks = [
  { to: "/ho-so", label: "Hồ sơ" },
  { to: "/lich-hen", label: "Lịch hẹn" },
  { to: "/lich-su-kham", label: "Lịch sử khám" },
  { to: "/hoa-don", label: "Hóa đơn" },
  { to: "/thong-bao", label: "Thông báo" },
];

export function PatientAccountNavigation() {
  return (
    <nav className="patient-account-nav" aria-label="Điều hướng tài khoản bệnh nhân">
      {accountLinks.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/ho-so"}
          className={({ isActive }) =>
            `patient-account-nav-link${isActive ? " active" : ""}`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
