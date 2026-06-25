import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@mcp_router/ui";
import Manual from "./Manual";

const DiscoverWrapper: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Escape returns to the server list (consistent with the rest of the app)
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        navigate("/servers");
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [navigate]);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs: Servers > Add */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/servers">{t("serverList.title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("discoverServers.title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Page title */}
      <h1 className="text-3xl font-bold">{t("discoverServers.title")}</h1>
      <Manual />
    </div>
  );
};

export default DiscoverWrapper;
