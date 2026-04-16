export default function Traditions() {
  return (
    <>
      {/* Hero */}
      <header className="relative min-h-screen flex items-center justify-center pt-32 md:pt-40 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAZ9Bn0ilDIcpiNHjvV4DHZ8JhSpS7un6k_p227DaHE9fgxJofEdZIOLLdbIqoEj2ii1Tc__jqQrJVDRoY1CDXtXTN1mUp5DTQ2Qh0PPnWXayQMEC_YLFNWcBuB4bYOxjde5bOWx-ALhWc28YD_bGVSK1-rqReig-lxzNNX4Jyv7kBxSc5JxDI0zqGnS-OWQhbkvnqAdkHSX1MngthjwuxyhmpOQzMEJXn_Hrwc-_xhyFfuWZCEu3TQIyT3jIUFU0x3VRZeFMe5P-7I"
            alt="Mist-covered hills"
            className="w-full h-full object-cover brightness-75"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface" />
        </div>
        <div className="relative z-10 max-w-5xl px-12 text-center text-white">
          <span className="font-headline uppercase tracking-[0.3em] text-secondary-container font-semibold mb-6 block">Our Heritage</span>
          <h1 className="font-brand text-6xl md:text-8xl leading-none mb-8 tracking-tighter text-surface-bright">
            A Legacy Written in <span className="text-secondary-container">Smoke &amp; Ash</span>
          </h1>
          <p className="font-headline text-xl md:text-2xl text-surface-container-low max-w-3xl mx-auto leading-relaxed opacity-90">
            In the valleys of the Seven Sisters, cooking isn't just a daily chore; it's a rhythmic dialogue between the land and its people.
          </p>
        </div>
      </header>

      {/* Alchemy of Khar */}
      <section className="py-24 px-6 md:px-12 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-16 items-center">
          <div className="md:col-span-7 relative">
            <div className="absolute -top-12 -left-12 w-64 h-64 bg-secondary-container/10 rounded-full blur-3xl" />
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuD0OJjDKyDPIrwAtO_pvE6LFwSFUSpeyaq3O16XcNb-N-2Ij5FLRYTcuCr_bIiuT3ofq4aW_Oc74C9U61QUSuha59KMzvJwHqWzBuMYx5Q3niUXZR2VvpuHXuWjrhGgA_dvd0bTrta38XfyF0BNuxzrUOfHuYQFkGMA-iBTgFlCUVg86y2sBdtY-7-ZYVBbUvCcTvsJhSwT_mkdIyFbhhVsozKJ1UG_GUv8Xi0OkeN7TGXyXPg8bIUyyXaLMqrtceBGiWw8I8K3H0Rm"
              alt="Khar preparation"
              className="w-full h-[600px] object-cover rounded-xl shadow-2xl relative z-10"
            />
            <div className="absolute bottom-12 -right-8 bg-primary-container p-8 rounded-xl text-on-primary-container max-w-xs z-20 shadow-xl">
              <h3 className="font-brand text-2xl mb-4">The Filter of Life</h3>
              <p className="text-sm opacity-90 leading-relaxed">The liquid 'Khar' is extracted through a patient filtration process using charred banana skin ash and bamboo filters.</p>
            </div>
          </div>
          <div className="md:col-span-5 flex flex-col justify-center">
            <span className="text-tertiary font-bold tracking-widest uppercase text-sm mb-4">Traditional Methods</span>
            <h2 className="font-brand text-5xl text-primary mb-8 leading-tight">The Sacred <br />Ash Filtering</h2>
            <div className="space-y-6 text-on-surface-variant leading-relaxed text-lg">
              <p>Central to Assamese cuisine is <span className="text-secondary font-bold">Khar</span>, an ingredient that defies modern chemical substitutes. It begins with the trunk or peel of the 'Bhim Kol'—a seeded local banana.</p>
              <p>Once sun-dried and burned to a fine grey ash, water is passed through this mineral-rich residue. The resulting amber liquid is the soul of our seasoning.</p>
            </div>
            <div className="pt-6">
              <button className="group flex items-center space-x-3 text-primary font-bold">
                <span>Discover our Khar process</span>
                <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Sun, Wind and Patience */}
      <section className="bg-surface-container-low py-32">
        <div className="max-w-screen-2xl mx-auto px-12">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
            <div className="max-w-2xl">
              <h2 className="font-brand text-5xl text-primary mb-6">Sun, Wind, and Patience</h2>
              <p className="font-headline text-xl text-on-surface-variant">We don't use industrial dehydrators. Our ingredients are cured by the elements, preserving the vital enzymes and rhythmic textures of the harvest.</p>
            </div>
            <div className="flex space-x-4">
              {[['100%', 'Natural Dehydration'], ['0%', 'Synthetic Additives']].map(([val, label]) => (
                <div key={label} className="p-4 bg-surface rounded-lg shadow-sm">
                  <span className="block text-3xl font-bold text-secondary">{val}</span>
                  <span className="text-xs uppercase tracking-tighter font-bold opacity-60">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 grid-rows-2 gap-6 h-auto md:h-[800px]">
            <div className="md:col-span-2 md:row-span-2 relative overflow-hidden rounded-xl">
              <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuD2dv6169TJA6_waTeKM93o1T4Sjq-UQNX8KigBXl5mm3wbLLa-PnwRkpqzP4goGLa-skbp7a3IHpEYJMlOgKtujHEQ6kAsM42-cAB0eP9Vom5b8C00mvyF1DB26yzDPgCALp4-PZc2m0fUW9Gri7M0_eDf5qMnoewhN1fzuoJemmUYUKLkdUt97RIs0iwMi-_E4xrW8H_dwCA25F8U_WNzHwqI6JaRacAeHxYrO3EkwyiEcCHzPSzrZ5r9BXOVIQZuHlXOGonQmVb2" alt="Solar Curing" className="absolute inset-0 w-full h-full object-cover hover:scale-110 transition-transform duration-700" />
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-on-surface/80 to-transparent text-surface">
                <h4 className="font-brand text-2xl">Solar Curing</h4>
                <p className="text-sm opacity-80 mt-2">The gentle heat of the sun concentrates flavors without scorching the delicate aromatic oils.</p>
              </div>
            </div>
            <div className="md:col-span-2 relative overflow-hidden rounded-xl">
              <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuA-awvA63DPDcVMXKIYaLkyJGwRMccn2v2jCNg49C0MHiLGphvTx3Tv5nWRA1qWW9Gr_1ep8yP48eSYI-_FKrg9UlkaLhPwJ0EeZg8AklXjRBSnfGEl6kpX8hPr0ebRl8ABhf5MX3Fq-9zQHIAislqwniCokXqi5Tgd95eGhhh0aaLb_HCnYJHabpFKQFwEWC2IQ49cfTQqkzSMjmZS1-Awz10-BSEhYZHsdk9O_XBt3Xc6ZbI5xBr4caCeVp9BkvTTAs6_be7pwoDc" alt="Traditional Craft" className="absolute inset-0 w-full h-full object-cover hover:scale-110 transition-transform duration-700" />
              <div className="absolute top-6 right-6 bg-secondary-container px-4 py-2 rounded-full text-on-secondary-container font-bold text-xs">TRADITIONAL CRAFT</div>
            </div>
            <div className="relative overflow-hidden rounded-xl">
              <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBQT68fy3M2g1Jm0QnGHitvxbVJOHcXxxoosyWpPU0thU4_3U-EFRLAEYYFisrrYqgXwQt1hVBfWxYt8nbmUk9KDWR3IbE_2_MRyqnzStXwbKy-YfK6a82XcNuP1t-dQblDnvJ4jG1PGPajsRV6BHePQdLQVxYp2zJgKfraNqxOPTKIGdXBaOp_RzaPIoauCb0gQmIrVDUvOkov0Y2jHy0WfX0n8WP30n-9iOhE5uYfr8YWVRdd1UPRciHv-klz6npR_iKAk2UwGoJL" alt="Mortar and Pestle" className="absolute inset-0 w-full h-full object-cover" />
            </div>
            <div className="relative overflow-hidden rounded-xl bg-primary flex flex-col justify-center p-8 text-on-primary">
              <span className="material-symbols-outlined text-secondary-container text-4xl mb-4">eco</span>
              <h4 className="font-brand text-xl mb-2">Sustainable Sourcing</h4>
              <p className="text-sm opacity-80">Directly from the community forest gardens of the Seven Sisters.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Ethical Pillars */}
      <section className="py-32 px-6 md:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-24 items-start">
            <div className="md:sticky top-32">
              <h2 className="font-brand text-5xl text-primary mb-8 leading-tight">Purity Without <br />Compromise</h2>
              <p className="font-headline text-xl text-on-surface-variant mb-12">At Hatvoni, 'Chemical-Free' isn't a marketing label; it's a centuries-old survival strategy that honors the health of the soil and the consumer.</p>
              <div className="space-y-12">
                {[
                  { icon: 'water_drop', bg: 'bg-tertiary-fixed text-on-tertiary-fixed-variant', title: 'No Artificial Preservatives', desc: "We use fermentation, salt, and the inherent anti-microbial properties of local herbs like 'Northeastern Ginger' to ensure shelf-life." },
                  { icon: 'forest', bg: 'bg-primary-fixed text-on-primary-fixed-variant', title: 'Forest-to-Table', desc: "Our ingredients are wild-harvested or grown in 'Bari' (homestead gardens) that mimic the natural biodiversity of the rainforest." },
                ].map(({ icon, bg, title, desc }) => (
                  <div key={title} className="flex gap-6">
                    <div className={`flex-shrink-0 w-16 h-16 rounded-full ${bg} flex items-center justify-center`}>
                      <span className="material-symbols-outlined text-3xl">{icon}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-xl mb-2">{title}</h4>
                      <p className="text-on-surface-variant leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-16">
              <div className="bg-surface-container-highest p-2 rounded-2xl overflow-hidden shadow-lg">
                <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuC9a2d9fksHOLfbGswZs9-hSp9vfYCTlUKNET-hzpdj0mteUowVtYkbF4dWW14M0nqmXp3l8n38ocPv-sVIMS3TSC4hXmjoYAe1WZM5MCR5_MRZVpUpHANfFabww2eA_L85L4Thnu4-UH-Ovp5UaKUEXAmpuh8oXMWhJYzZP9kpUgRZxjW8IKdB8F8n1v_gQRMNIHTogBPK1oera55WhK0zdmUj87-sbZVlcniH7lXpqYQl4nNFX_-PnWRo3n9jp9nMXqWVQJ6MOUd-" alt="Lakadong Turmeric" className="w-full h-[500px] object-cover rounded-xl" />
                <div className="p-8">
                  <span className="text-xs font-bold text-secondary uppercase tracking-widest mb-2 block">Source Spotlight</span>
                  <h3 className="font-brand text-2xl text-primary mb-4">Lakadong Turmeric</h3>
                  <p className="text-on-surface-variant italic">Harvested from the Jaintia Hills, boasting a curcumin content nearly three times higher than commercial varieties.</p>
                </div>
              </div>
              <div className="bg-primary text-on-primary p-12 rounded-3xl relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-secondary-container/20 rounded-full" />
                <h3 className="font-brand text-3xl mb-6 relative z-10">The Sustainable Promise</h3>
                <p className="text-lg opacity-90 mb-8 relative z-10">We return a portion of every sale to the traditional farming cooperatives of the North East, ensuring that the 'Knowledge of the Elders' remains a viable livelihood.</p>
                <hr className="border-on-primary/20 mb-8" />
                <div className="flex items-center space-x-4">
                  <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAJUlHqvbzy0IwKaN5WDx8s3zbo8w5yto500XSWCKJoCBzjj8nqaxy9Mb-iB819Moub7bWY-wVkOwCQwXuPSDitNocye3WEn9Ch1Sc8gRZub6NHOpz6mBQsLWuI875_DE-L5b91Pz5i8QeMEq5ZZ-LMniywpMJN7DkJDzf1CDOiAMemuNirDG8sBbFMAOJ8rIrr6WYLJXKFPZXzQCTCI9LmWaPwsWwRqeGiAsCavhspq2ZapIU5h5xU13HdW3qRhZ53z2MzEKG1ZciB" alt="Anjali Bora" className="w-16 h-16 rounded-full object-cover border-2 border-secondary-container" />
                  <div>
                    <p className="font-bold">Anjali Bora</p>
                    <p className="text-sm opacity-70">Master Collector, Hatvoni Cooperative</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
