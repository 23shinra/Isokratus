"use client";

import { AppChrome } from "@/components/app-chrome";

export default function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppChrome>{children}</AppChrome>;
}
