export const visionGroups = [
  {
    label: "Dashboards",
    icon: "home",
    pages: [
      ["/dashboards/default", "Firm overview", "default"],
      ["/dashboards/crm", "Client relationships", "crm"],
    ],
  },
  {
    label: "Legal workspace",
    icon: "briefcase",
    pages: [
      ["/firm/workspace", "Firm workspace", "firm"],
      ["/matters", "Matter Review", "matters"],
      ["/research", "Research & Documents", "research"],
      ["/operations", "Firm Operations", "operations"],
    ],
  },
  {
    label: "Firm & people",
    icon: "users",
    pages: [
      ["/pages/profile/profile-overview", "My profile", "profile"],
      ["/pages/profile/teams", "Practice teams", "teams"],
      ["/pages/profile/all-projects", "Matter portfolios", "projects"],
      ["/pages/users/reports", "Team reports", "reports"],
      ["/pages/users/new-user", "Invite a colleague", "new-user"],
      ["/pages/account/settings", "Account settings", "settings"],
      ["/pages/account/billing", "Firm billing", "billing"],
      ["/pages/account/invoice", "Invoice", "invoice"],
      ["/pages/projects/general", "Engagement overview", "general"],
      ["/pages/projects/timeline", "Matter timeline", "timeline"],
      ["/pages/pricing-page", "Workspace plans", "pricing"],
      ["/pages/rtl", "International desk", "rtl"],
      ["/pages/widgets", "Practice widgets", "widgets"],
      ["/pages/charts", "Firm analytics", "charts"],
      ["/pages/alerts", "Notifications", "alerts"],
    ],
  },
  {
    label: "Applications",
    icon: "grid",
    pages: [
      ["/applications/kanban", "Review board", "kanban"],
      ["/applications/wizard", "Matter intake", "wizard"],
      ["/applications/data-tables", "Matter register", "data-tables"],
      ["/applications/calendar", "Legal calendar", "calendar"],
      ["/applications/practice-desk", "Practice desk", "practice-desk"],
    ],
  },
  {
    label: "Engagement services",
    icon: "file",
    pages: [
      ["/ecommerce/products/new-product", "New service", "new-product"],
      ["/ecommerce/products/edit-product", "Edit service", "edit-product"],
      ["/ecommerce/products/product-page", "Service overview", "product-page"],
      ["/ecommerce/orders/order-list", "Engagement requests", "order-list"],
      ["/ecommerce/orders/order-details", "Request details", "order-details"],
    ],
  },
  {
    label: "Account access",
    icon: "lock",
    pages: [
      ["/authentication/sign-in/basic", "Sign in · basic", "sign-in-basic"],
      ["/authentication/sign-in/cover", "Sign in · cover", "sign-in-cover"],
      [
        "/authentication/sign-in/illustration",
        "Sign in · illustration",
        "sign-in-illustration",
      ],
      ["/authentication/join", "Join with invitation", "join"],
      ["/authentication/sign-up/basic", "Join · basic", "sign-up-basic"],
      ["/authentication/sign-up/cover", "Join · cover", "sign-up-cover"],
      [
        "/authentication/sign-up/illustration",
        "Join · illustration",
        "sign-up-illustration",
      ],
    ],
  },
];
export const visionRoutes = visionGroups.flatMap((group) =>
  group.pages.map(([path, title, kind]) => ({
    path,
    title,
    kind,
    group: group.label,
  })),
);
export function visionRoute(path) {
  return visionRoutes.find((r) => r.path === path);
}
