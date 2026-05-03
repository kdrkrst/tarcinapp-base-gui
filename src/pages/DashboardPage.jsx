import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import StatCard from '../components/ui/StatCard'

const activityData = [
  { day: 'Mon', entities: 12, lists: 5, reactions: 8 },
  { day: 'Tue', entities: 19, lists: 7, reactions: 14 },
  { day: 'Wed', entities: 8,  lists: 3, reactions: 6  },
  { day: 'Thu', entities: 25, lists: 11, reactions: 20 },
  { day: 'Fri', entities: 31, lists: 14, reactions: 27 },
  { day: 'Sat', entities: 16, lists: 6, reactions: 11 },
  { day: 'Sun', entities: 22, lists: 9, reactions: 17 },
]

const visibilityData = [
  { name: 'Public',    value: 63, color: '#34d399' },
  { name: 'Protected', value: 22, color: '#fbbf24' },
  { name: 'Private',   value: 15, color: '#f87171' },
]

const kindData = [
  { kind: 'book',    count: 24 },
  { kind: 'product', count: 17 },
  { kind: 'article', count: 31 },
  { kind: 'user',    count: 9  },
  { kind: 'tag',     count: 42 },
]

const recentActivity = [
  { id: 'ent-001', type: 'Entity',        action: 'Created', name: 'The Pragmatic Programmer', time: '2 min ago' },
  { id: 'lst-002', type: 'List',          action: 'Updated', name: 'DevOps Reading List',       time: '14 min ago' },
  { id: 'er-001',  type: 'Entity Reaction', action: 'Created', name: 'Rating on ent-001',      time: '31 min ago' },
  { id: 'rel-003', type: 'Relation',      action: 'Created', name: 'lst-002 → ent-004',        time: '1 h ago' },
  { id: 'ent-006', type: 'Entity',        action: 'Deleted', name: 'Refactoring',              time: '2 h ago' },
]

const TOOLTIP_STYLE = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#cbd5e1',
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Entities"
          value="1,284"
          delta={12}
          color="blue"
          icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
        <StatCard
          label="Total Lists"
          value="347"
          delta={5}
          color="green"
          icon="M4 6h16M4 10h16M4 14h16M4 18h16"
        />
        <StatCard
          label="Entity Reactions"
          value="5,631"
          delta={-3}
          color="amber"
          icon="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          label="Relations"
          value="892"
          delta={8}
          color="purple"
          icon="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity area chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Weekly Activity</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={activityData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradEntities" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradLists" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Area type="monotone" dataKey="entities" stroke="#3b82f6" strokeWidth={2} fill="url(#gradEntities)" />
              <Area type="monotone" dataKey="lists" stroke="#34d399" strokeWidth={2} fill="url(#gradLists)" />
              <Area type="monotone" dataKey="reactions" stroke="#a78bfa" strokeWidth={2} fill="none" strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Visibility pie */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Visibility Distribution</h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={visibilityData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {visibilityData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1.5">
            {visibilityData.map((v) => (
              <div key={v.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
                  <span className="text-slate-400">{v.name}</span>
                </div>
                <span className="text-slate-300 font-medium">{v.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Kind bar chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Entities by Kind</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={kindData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="kind" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent activity feed */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {recentActivity.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  item.action === 'Deleted' ? 'bg-rose-400' :
                  item.action === 'Created' ? 'bg-emerald-400' : 'bg-blue-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200">
                    <span className={`font-medium mr-1 ${
                      item.action === 'Deleted' ? 'text-rose-400' :
                      item.action === 'Created' ? 'text-emerald-400' : 'text-blue-400'
                    }`}>{item.action}</span>
                    <span className="text-slate-400 text-xs mr-1">[{item.type}]</span>
                    {item.name}
                  </p>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notice */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 flex items-center gap-3">
        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-slate-400">
          Dashboard widgets show placeholder data. Connect to live APIs or enable a dummy dataset via <strong className="text-slate-300">Settings</strong>.
        </p>
      </div>
    </div>
  )
}
