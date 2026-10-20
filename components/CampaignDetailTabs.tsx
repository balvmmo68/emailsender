"use client";

import { ReactNode, useState } from "react";

type CampaignTab = "manage" | "preview" | "recipients";

type Props = {
  management: ReactNode;
  preview: ReactNode;
  recipients: ReactNode;
  initialTab?: CampaignTab;
};

const tabs: Array<{ id: CampaignTab; label: string }> = [
  { id: "manage", label: "Quản lý campaign" },
  { id: "preview", label: "Preview HTML" },
  { id: "recipients", label: "Recipients đã import" },
];

export default function CampaignDetailTabs({ management, preview, recipients, initialTab = "manage" }: Props) {
  const [activeTab, setActiveTab] = useState<CampaignTab>(initialTab);
  const content: Record<CampaignTab, ReactNode> = { manage: management, preview, recipients };

  return <div className="campaign-detail-tabs-wrap">
    <div className="campaign-detail-tabs" role="tablist" aria-label="Campaign detail sections">
      {tabs.map((tab) => <button
        key={tab.id}
        id={`campaign-tab-${tab.id}`}
        className={`campaign-detail-tab ${activeTab === tab.id ? "active" : ""}`}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls={`campaign-panel-${tab.id}`}
        tabIndex={activeTab === tab.id ? 0 : -1}
        onClick={() => setActiveTab(tab.id)}
      >{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div
      key={tab.id}
      id={`campaign-panel-${tab.id}`}
      className="campaign-detail-tabpanel"
      role="tabpanel"
      aria-labelledby={`campaign-tab-${tab.id}`}
      hidden={activeTab !== tab.id}
      tabIndex={0}
    >{content[tab.id]}</div>)}
  </div>;
}
