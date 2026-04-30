import { useState } from 'react';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: 'Product Inquiry', message: '' });

  return (
    <main className="pt-8 md:pt-12 pb-24">
      {/* Hero */}
      <section className="px-6 md:px-12 max-w-screen-2xl mx-auto mb-20">
        <div className="grid grid-cols-12 gap-8 items-end">
          <div className="col-span-12 md:col-span-7">
            <h1 className="font-brand text-5xl md:text-7xl text-primary leading-none tracking-tighter mb-8">
              Connect with our Heritage
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant max-w-xl leading-relaxed">
              Rooted in the fertile soils of the Seven Sisters, Hatvoni is a bridge between ancestral wisdom and modern wellness. Reach out to join our journey of agricultural preservation.
            </p>
          </div>
          <div className="col-span-12 md:col-span-5 relative">
            <div className="aspect-[4/3] rounded-xl overflow-hidden bg-surface-container-low">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuD-L8ARjsRmHTLR2MT1hkbkmrNCn-0aCTAY2PuabOAdJDdMnaZDrlEIYPSSf0SCiV36GvpcDxC-_qh3mlIfvrt7uE8ShwW6ZNeIjkDcArlG_JIvcpNWa2THIbqd6skSD7ZFYlZdzURYABEs7Eyi13bbqrgqS159l3WSGUqluCLdWTAOaHjRzGPldVclOVHqaVT1NO0NMIIfTHtKYWyWAfEqU7bW8z9IHhL9J8mc7OfV8kDu39l3TQvlHmSjiXd6lvZ573vmGfUI04O9"
                alt="Tea plantations"
                className="w-full h-full object-cover grayscale-[20%] hover:grayscale-0 transition-all duration-700"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="px-6 md:px-12 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-12 gap-8 lg:gap-12">
          {/* Contact Form */}
          <div className="col-span-12 lg:col-span-7 bg-surface-container-low p-8 md:p-12 rounded-xl">
            <h2 className="font-brand text-3xl font-extrabold text-primary mb-10 tracking-tight">Send a Message</h2>
            <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-2">Full Name</label>
                  <input
                    type="text" placeholder="Arup Hazarika"
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-transparent border-0 border-b-2 border-outline-variant focus:ring-0 focus:border-primary transition-colors py-2 px-0 text-on-surface placeholder:text-outline-variant/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-2">Email Address</label>
                  <input
                    type="email" placeholder="arup@heritage.com"
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-transparent border-0 border-b-2 border-outline-variant focus:ring-0 focus:border-primary transition-colors py-2 px-0 text-on-surface placeholder:text-outline-variant/50 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-2">Subject</label>
                <select
                  value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full bg-transparent border-0 border-b-2 border-outline-variant focus:ring-0 focus:border-primary transition-colors py-2 px-0 text-on-surface outline-none"
                >
                  <option>Product Inquiry</option>
                  <option>Wholesale Partnerships</option>
                  <option>Sustainability Initiatives</option>
                  <option>General Feedback</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-2">Your Message</label>
                <textarea
                  rows={4} placeholder="Tell us how we can help..."
                  value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full bg-transparent border-0 border-b-2 border-outline-variant focus:ring-0 focus:border-primary transition-colors py-2 px-0 text-on-surface placeholder:text-outline-variant/50 outline-none resize-none"
                />
              </div>
              <button type="submit" className="bg-primary-container text-on-primary-container px-10 py-4 rounded-xl font-headline font-bold text-lg hover:bg-primary hover:text-white transition-all duration-300 active:scale-95 flex items-center gap-3">
                Send Message <span className="material-symbols-outlined">north_east</span>
              </button>
            </form>
          </div>

          {/* Contact Info */}
          <div className="col-span-12 lg:col-span-5 space-y-12">
            <div className="bg-secondary-container p-8 rounded-xl text-on-secondary-container relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-brand text-2xl mb-4">Our Guwahati Roots</h3>
                <p className="font-body leading-relaxed mb-6">Visit our flagship heritage center where we curate the finest organic harvests from local farming clusters across the Northeast.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <span className="material-symbols-filled text-primary">location_on</span>
                    <div>
                      <p className="font-bold">Heritage Square, GS Road</p>
                      <p className="text-sm opacity-80">Guwahati, Assam 781005</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="material-symbols-filled text-primary">mail</span>
                    <p className="font-bold">hello@hatvoni.com</p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-10 -right-10 opacity-10 rotate-12">
                <span className="material-symbols-outlined" style={{ fontSize: '12rem' }}>eco</span>
              </div>
            </div>

            {/* Map */}
            <div className="rounded-xl overflow-hidden aspect-video bg-surface-container-highest relative group">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAqqJKlt29dkrKN57--1ZPgXknCZKXojYteqtCQhp2M-puDPJkm8tq1nLRyXIhaXmLXfk5b4zou5D1-IMQP5CvHkOjkxyNEAhZxfeLqQD7FZFGFKVUZESbY0K8Rx1uT_z5D_tqDDVYqTJ1VWYQQe7YChQY6MH_yuwX2EwJ8Akq9-PbZm7zSXaxKG21Bq8miQoDVLf-S2XVv7JWoxwYzqPyRyRRm5nkd4jW2oGTmcv0vlxSrUUiGIYeibRoRLk_7TTy-FXV8nqhPcAmc"
                alt="Guwahati map"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                <div className="bg-surface p-4 rounded-full shadow-xl">
                  <span className="material-symbols-filled text-primary text-3xl">push_pin</span>
                </div>
              </div>
            </div>

            {/* Social */}
            <div className="pt-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-secondary mb-6">Follow the Harvest</h4>
              <div className="flex gap-4">
                {['language', 'camera', 'movie', 'brand_family'].map((icon) => (
                  <a key={icon} href="#" className="w-12 h-12 rounded-full border border-outline-variant flex items-center justify-center hover:bg-primary hover:text-white transition-all duration-300 text-primary">
                    <span className="material-symbols-outlined">{icon}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Banner */}
      <section className="mt-24 px-6 md:px-12 max-w-screen-2xl mx-auto">
        <div className="bg-primary text-on-primary rounded-xl p-12 grid grid-cols-12 items-center gap-8">
          <div className="col-span-12 md:col-span-8">
            <h2 className="font-brand text-3xl mb-4 text-secondary-container">Deeply Rooted Support</h2>
            <p className="text-on-primary/80 max-w-2xl text-lg">Our customer service team understands the nuances of our traditional products. We're here to guide you through recipes, health benefits, and shipping logistics.</p>
          </div>
          <div className="col-span-12 md:col-span-4 flex md:justify-end">
            <div className="bg-surface-container-low/10 backdrop-blur-md p-6 rounded-xl border border-on-primary/10">
              <div className="flex items-center gap-4 mb-2">
                <span className="material-symbols-outlined text-secondary-container">verified</span>
                <span className="font-headline font-bold">100% Traceable</span>
              </div>
              <p className="text-sm opacity-70">Every response from our team is backed by direct contact with our agricultural clusters.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
