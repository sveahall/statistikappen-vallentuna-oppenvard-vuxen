import { Button } from "@/components/ui/button";
import { UsersIcon, SettingsIcon, FileTextIcon } from "lucide-react";

interface AdminTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const AdminTabs = ({ activeTab, setActiveTab }: AdminTabsProps): JSX.Element => {
  const tabs = [
    {
      id: "users",
      label: "Användarhantering",
      icon: UsersIcon,
      count: 24,
    },
    {
      id: "settings",
      label: "Systeminställningar",
      icon: SettingsIcon,
    },
    {
      id: "audit",
      label: "Granskningslogg",
      icon: FileTextIcon,
      count: 156,
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          return (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--tenant-brand)] text-white hover:bg-[var(--tenant-brand-hover)]"
                  : "text-[#666666] hover:bg-gray-50"
              }`}
            >
              <IconComponent className="w-4 h-4" />
              {tab.label}
              {tab.count && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-[#666666]"
                }`}>
                  {tab.count}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
