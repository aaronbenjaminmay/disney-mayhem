export type AppTab = 'today' | 'days' | 'attention' | 'reservations' | 'notes';

type TabsProps = {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
};

const tabs: { id: AppTab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'days', label: 'All Days' },
  { id: 'attention', label: 'Attention' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'notes', label: 'Notes' },
];

export function Tabs({ activeTab, onChange }: TabsProps) {
  return (
    <nav aria-label="Main sections" className="sticky bottom-0 z-20 border-t border-[#2C2C2E] bg-[#111111]/95 px-2 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-sm font-black transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] ${
              activeTab === tab.id ? 'bg-[#0A84FF] text-black' : 'bg-[#1C1C1E] text-white hover:bg-[#2C2C2E]'
            }`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
