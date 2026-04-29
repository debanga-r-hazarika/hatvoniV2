import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminStats({ stats, setActiveTab }) {
  const navigate = useNavigate();

  const statCards = [
    { id: 'customers', label: 'Customers',  value: stats.customers, unit: 'users',    icon: 'group',           color: '#004a2b', bg: '#004a2b0d', action: () => setActiveTab('customers') },
    { id: 'sellers',   label: 'Sellers',     value: stats.sellers,   unit: 'partners', icon: 'storefront',      color: '#047857', bg: '#0478570d', action: () => navigate('/admin/sellers') },
    { id: 'products',  label: 'Products',    value: stats.products,  unit: 'items',    icon: 'inventory_2',     color: '#815500', bg: '#8155000d', action: () => setActiveTab('products') },
    { id: 'lots',      label: 'Lots',        value: stats.lots,      unit: 'bundles',  icon: 'all_inclusive',   color: '#0369a1', bg: '#0369a10d', action: () => setActiveTab('lots') },
    { id: 'recipes',   label: 'Recipes',     value: stats.recipes,   unit: 'dishes',   icon: 'restaurant_menu', color: '#be123c', bg: '#be123c0d', action: () => setActiveTab('recipes') },
    { id: 'orders',    label: 'Orders',      value: stats.orders,    unit: 'total',    icon: 'package_2',       color: '#ffffff', bg: '#004a2b',   action: () => navigate('/admin/orders'), isDark: true },
  ];

  const quickLinks = [
    { id: 'inventory',   label: 'Inventory',    desc: 'Track stock',      icon: 'inventory',       action: () => navigate('/admin/inventory') },
    { id: 'coupons',     label: 'Coupons',       desc: 'Discounts',        icon: 'sell',            action: () => navigate('/admin/coupons') },
    { id: 'logistics',   label: 'Logistics',     desc: 'Shipping hub',     icon: 'local_shipping',  action: () => navigate('/admin/logistics') },
    { id: 'support',     label: 'Support',       desc: 'Tickets & SLA',    icon: 'support_agent',   action: () => navigate('/admin/support') },
    { id: 'recipe-page', label: 'Page Config',   desc: 'Edit sections',    icon: 'web',             action: () => setActiveTab('recipe-page') },
    { id: 'layout',      label: 'Shop Layout',   desc: 'Sort catalog',     icon: 'grid_on',         action: () => setActiveTab('layout') },
    { id: 'waba-details', label: 'WABA Details',  desc: 'WABA setup APIs',  icon: 'chat',            action: () => setActiveTab('waba-details') },
    { id: 'employees',   label: 'Employees',     desc: 'Manage access',    icon: 'badge',           action: () => navigate('/admin/employees') },
  ];

  return (
    <div className="space-y-8">
      {/* Primary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => (
          <button
            key={card.id}
            onClick={card.action}
            className="text-left rounded-2xl p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] border group"
            style={{
              backgroundColor: card.isDark ? card.bg : '#ffffff',
              borderColor: card.isDark ? card.bg : 'rgba(190,201,191,0.2)',
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105"
              style={{ backgroundColor: card.isDark ? 'rgba(255,255,255,0.15)' : card.bg }}
            >
              <span className="material-symbols-outlined text-lg" style={{ color: card.color }}>{card.icon}</span>
            </div>
            <p className="text-2xl font-bold tracking-tight leading-none mb-0.5" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif', color: card.isDark ? '#fff' : '#004a2b' }}>
              {card.value}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: card.isDark ? 'rgba(255,255,255,0.6)' : '#3f4942' }}>
              {card.unit}
            </p>
          </button>
        ))}
      </div>

      {/* Quick Links Grid */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#3f4942] opacity-50 mb-3 ml-1">Quick Access</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {quickLinks.map((link) => (
            <button
              key={link.id}
              onClick={link.action}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-[#bec9bf]/20 hover:border-[#004a2b]/20 hover:bg-[#004a2b]/[0.02] transition-all group text-center"
            >
              <div className="w-8 h-8 rounded-lg bg-[#f5f4eb] flex items-center justify-center group-hover:bg-[#004a2b]/10 transition-colors">
                <span className="material-symbols-outlined text-base text-[#004a2b]">{link.icon}</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#004a2b] leading-tight">{link.label}</p>
                <p className="text-[9px] text-[#3f4942] opacity-60 leading-tight">{link.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
