import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminStats({ stats, setActiveTab }) {
  const navigate = useNavigate();

  const statCards = [
    { 
      id: 'customers', 
      label: 'Customers', 
      value: `${stats.customers} Users`, 
      icon: 'group', 
      color: 'bg-primary/10', 
      textColor: 'text-primary',
      action: () => setActiveTab('customers')
    },
    { 
      id: 'sellers', 
      label: 'Sellers', 
      value: `${stats.sellers} Partners`, 
      icon: 'storefront', 
      color: 'bg-emerald-600/10', 
      textColor: 'text-emerald-700',
      action: () => navigate('/admin/sellers')
    },
    { 
      id: 'products', 
      label: 'Products', 
      value: `${stats.products} Items`, 
      icon: 'inventory_2', 
      color: 'bg-secondary/10', 
      textColor: 'text-secondary',
      action: () => setActiveTab('products')
    },
    { 
      id: 'lots', 
      label: 'Lots', 
      value: `${stats.lots} Bundles`, 
      icon: 'all_inclusive', 
      color: 'bg-sky-600/10', 
      textColor: 'text-sky-700',
      action: () => setActiveTab('lots')
    },
    { 
      id: 'recipes', 
      label: 'Recipes', 
      value: `${stats.recipes} Dishes`, 
      icon: 'restaurant_menu', 
      color: 'bg-rose-600/10', 
      textColor: 'text-rose-700',
      action: () => setActiveTab('recipes')
    },
    { 
      id: 'orders', 
      label: 'Orders', 
      value: 'Fulfillments', 
      icon: 'package_2', 
      color: 'bg-white/20', 
      textColor: 'text-white',
      bgOverride: 'bg-tertiary shadow-md',
      action: () => navigate('/admin/orders')
    },
    { 
      id: 'inventory', 
      label: 'Inventory', 
      value: 'Track stock', 
      icon: 'inventory', 
      color: 'bg-surface-variant', 
      textColor: 'text-on-surface-variant',
      bgOverride: 'bg-surface-container-lowest border border-outline-variant/30',
      action: () => navigate('/admin/inventory')
    },
    { 
      id: 'coupons', 
      label: 'Coupons', 
      value: 'Discounts', 
      icon: 'sell', 
      color: 'bg-surface-variant', 
      textColor: 'text-on-surface-variant',
      bgOverride: 'bg-surface-container-lowest border border-outline-variant/30',
      action: () => navigate('/admin/coupons')
    },
    {
      id: 'logistics',
      label: 'Logistics',
      value: 'Velocity Hub',
      icon: 'local_shipping',
      color: 'bg-cyan-50',
      textColor: 'text-cyan-700',
      bgOverride: 'bg-surface-container-lowest border border-outline-variant/30',
      action: () => navigate('/admin/logistics')
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {statCards.map((card) => (
        <div 
          key={card.id} 
          onClick={card.action} 
          className={`${card.bgOverride || 'bg-surface-container-low border border-outline-variant/30'} rounded-2xl p-5 flex items-center gap-5 cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all group`}
        >
          <div className={`w-14 h-14 rounded-2xl ${card.color} flex items-center justify-center group-hover:scale-105 transition-all ${card.bgOverride ? 'backdrop-blur-sm' : ''}`}>
            <span className={`material-symbols-outlined ${card.textColor} text-2xl`}>{card.icon}</span>
          </div>
          <div>
            <h3 className={`font-brand text-lg ${card.id === 'orders' ? 'text-white' : 'text-primary'} mb-0.5`}>{card.label}</h3>
            <p className={`font-body ${card.id === 'orders' ? 'text-white/80' : 'text-secondary'} font-bold text-sm`}>{card.value}</p>
          </div>
        </div>
      ))}
      
      {/* Page Layout / Shop Layout / Employees */}
        {/* Page Layout / Shop Layout / Employees */}
      <div onClick={() => setActiveTab('recipe-page')} className="bg-surface-container-lowest rounded-2xl p-5 flex items-center gap-5 cursor-pointer hover:-translate-y-1 hover:shadow-md border border-outline-variant/30 transition-all group">
         <div className="w-14 h-14 rounded-2xl bg-surface-variant flex items-center justify-center group-hover:scale-105 transition-all">
            <span className="material-symbols-outlined text-on-surface-variant text-2xl">web</span>
         </div>
         <div>
            <h3 className="font-brand text-lg text-primary mb-0.5">Page Layout</h3>
            <p className="font-body text-on-surface-variant font-medium text-sm">Edit limits</p>
         </div>
      </div>

      <div onClick={() => setActiveTab('layout')} className="bg-surface-container-lowest rounded-2xl p-5 flex items-center gap-5 cursor-pointer hover:-translate-y-1 hover:shadow-md border border-outline-variant/30 transition-all group">
         <div className="w-14 h-14 rounded-2xl bg-surface-variant flex items-center justify-center group-hover:scale-105 transition-all">
            <span className="material-symbols-outlined text-on-surface-variant text-2xl">grid_on</span>
         </div>
         <div>
            <h3 className="font-brand text-lg text-primary mb-0.5">Shop Layout</h3>
            <p className="font-body text-on-surface-variant font-medium text-sm">Sort catalog</p>
         </div>
      </div>

      <div onClick={() => navigate('/admin/employees')} className="bg-surface-container-lowest rounded-2xl p-5 flex items-center gap-5 cursor-pointer hover:-translate-y-1 hover:shadow-md border border-outline-variant/30 transition-all group">
         <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center group-hover:scale-105 transition-all">
            <span className="material-symbols-outlined text-indigo-600 text-2xl">badge</span>
         </div>
         <div>
            <h3 className="font-brand text-lg text-primary mb-0.5">Employees</h3>
            <p className="font-body text-on-surface-variant font-medium text-sm">Manage access</p>
         </div>
      </div>
    </div>
  );
}
