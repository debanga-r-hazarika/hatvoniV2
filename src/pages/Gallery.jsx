const galleryItems = [
  { id: 1, className: 'col-span-2 row-span-2', label: 'THE LANDSCAPE', title: 'Dawn over the Seven Sisters', quote: 'Where the mist whispers ancient secrets to the tea leaves.', overlayClass: 'from-primary/80', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBFBpcN3cXtFNlcbqhA1g3TON1UDY9Twqxe-YjmOqgzHUl19rqWEKyvNys6Lt12f0Ly-gPrrxlod0xkB30cVqnB6cppb3fyqaqhULiRQQcPtgJXpFTilrdGhwENsRlOhEdfbdBmhQxUKBLh14tZzxo18uEEe_-0Ng2aahsSe88J0tlIfCCilWp7PN8GN5j-XgICNO0-vYIXBkEc9_37TkKMYpLL9DsS1x2AWP0DzoRSAPGlaP4a_dwfs8jpk5zXOulVNax8v09F3hCx' },
  { id: 2, className: 'row-span-3', label: 'THE PROCESS', title: 'Rhythm of the Mortar', quote: 'Every spice tells a story of patience and heritage.', overlayClass: 'from-tertiary/80', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD16ZJBNSIbKiT5GiHUxmIv4pK1P7MYbeaQ_1-Owk2vLxEvYsiX0PAPI_J8pCEiY5RP7rcxXgX22TmIafGp-cDRJjoUpEvJLgoTXB7ro2JzAq3hoxWp6xr39xa65aWHbU2S5HS3Upkm_2dt_2x1cgHZN0y2buXo8GnI2tt3Rr-iV4MfYaxsy6ECCfI6lOlp-rhxg1Jv_asOKY50YyrZAPkHU3rKCeWq_qGpQgEXQlsfX1XbVhUJtRMJdviNwALdgSWNpr-mM1HSzqkI' },
  { id: 3, className: 'row-span-2', label: 'OUR PEOPLE', title: 'Guardians of the Soil', quote: 'Nurturing the earth that nurtures us all.', overlayClass: 'from-secondary/80', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZ5DYmI9b-MuZSrwA_O4mjzIEJFCx0iqhp3hT_TJOXsGq-f1uIjlXQXeHZkEKp3KERBBEO523QnAxiZoUeYspNGlYnPXmCZVZStKcV0_55hNUohYvVVByLrIFxRgjP61dkxPlfOPECaydoCj_fac2uNdsfmH3L_RwtBj9jJ47f4tg6eI6UeqW1G9X90-YWv9bDWZUjW31iikmZmDTtc_q21FUm44PdnreLpjQLUyqhZ3xUgmc4JuEOwyY946S2oZYXjwRaFbDg-uqB' },
  { id: 4, className: 'row-span-2', label: 'PURITY', title: null, quote: '"Nature does not hurry, yet everything is accomplished."', overlayClass: 'from-primary-container/20', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAHB_-iYQSHRI_zjar_TReSY-8Jrl0FnpvCBccg8-4fCnWjkudwYTdT0YfEgZnirLvmdlwKfBULbd7SSh47V-7JBmvRh_HIwru3527W_EK-tgcC7r7sp4ADo_HSDDYTWQOGy1QquN7_l2xlGBy-JXM7cPdWulD_Px7t9PSbb_pyCVB8Difq9q3MR_sq2vPqqX62JZ_5s_ewKaLm1P2dJU_il7HxGneJnc0hLL1Qbl-RmplinEtBHbpsA3PTENz1trNlaU8dRG-bwirr' },
  { id: 5, className: 'col-span-2 row-span-2', label: 'THE KITCHEN', title: 'Where Magic Simmers', quote: 'Tradition is the only ingredient we never measure.', overlayClass: 'from-primary/90', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCqoZpGbVbWnRrpIsADh-hxC40SunrLW5D33FJBZqRoL0AwTx3cYdQsBo-YP-aK_Lz6MDPySVjpUBLODv2Ja0On92Vj2_n8D26mf4G8G0finiqLA8l4D5ptioy-TtKEjl__oWIoXJvoo9y2NJS3w7MdOOX3I-H3nniEcv7ZVad1X4YeLgvg57niBEj-3OQlyLHWMPezky8PvldD__vKg5OQMmiyqRvriY57a3OFB5w0OKEnl0Oof2Hv0FTqq26gGQnPti449TLCZLqb' },
  { id: 6, className: '', label: 'PATTERNS', title: null, quote: null, overlayClass: 'from-black/40', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA5wRFn74D66S6QUYQP3Zez0yVtIKC4LtHqJENHZZNupWmBjCCGC8gDjyh3YAW3HwnB70a_YoFIuM6FkeqOs4cT6chEZw_yLhhJMurqGcy1oNbXIeOeoQT9cvUa4szDoPtLJjibWUxwvmdULgIdxGqbVpQ6oFVyDOSnNXb6tEKiUjQhuTfHshwDJtZvoD7TS_pNda45P8tgzFUGJLXVhmqHkXjJIze5LQszdg4eJ7P--bjjg-7dFm_zGs1e-ZLpZKlz3WW8MpW1i-zN' },
  { id: 7, className: 'row-span-3', label: null, title: 'Ancestral Slumber', quote: null, overlayClass: 'from-secondary/60', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCuVtFawueNkjcv_pe8WTUWqcFKE1ulJepi3wa2H6CNG78Kk5Qd4D5x0t2ZMUUO_SHtRff4pFKOlC412HtZD6BRekEsEt4e0juBcMiKxVtSURcLNLxH84kMjdfjfQ72Cu_fXPKpDh4psckBs-Atii0IKdVR5rILiPVFKoS1fN1lbcDKazDsAqVfe08HzX6NK9kJ1svUhu1Gxf38pi6r8EtJ5NXsf1CICg6WztnJzGJQ8mhmwy80iyW2bwpstQJ_x3mFgfXGHHfOZQG0' },
];

export default function Gallery() {
  return (
    <main className="pt-32 pb-24">
      {/* Hero */}
      <header className="max-w-screen-2xl mx-auto px-12 mb-20 text-center md:text-left">
        <h1 className="font-brand text-5xl md:text-7xl text-primary leading-tight mb-6 tracking-tighter">
          Glimpses of the <br /><span className="text-secondary">Sacred Hills</span>
        </h1>
        <p className="font-headline text-xl md:text-2xl text-on-surface-variant max-w-2xl leading-relaxed">
          Capturing the vibrant landscape and kitchens that inspire every bottle of Hatvoni.
        </p>
      </header>

      {/* Gallery Grid */}
      <div className="max-w-screen-2xl mx-auto px-12">
        <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gridAutoRows: '200px' }}>
          {galleryItems.map((item) => (
            <div
              key={item.id}
              className={`relative group overflow-hidden rounded-xl bg-surface-container-low ${item.className}`}
            >
              <img
                src={item.img}
                alt={item.title || item.label}
                className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-700"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${item.overlayClass} via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8`}>
                {item.label && <span className="font-brand text-secondary-container text-sm mb-2">{item.label}</span>}
                {item.title && <h3 className="text-surface font-headline text-2xl font-bold">{item.title}</h3>}
                {item.quote && <p className="text-surface/80 mt-2 font-body italic">{item.quote}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quote */}
      <section className="mt-32 px-12 max-w-4xl mx-auto text-center">
        <div className="inline-block p-4 mb-8 bg-secondary-container rounded-full">
          <span className="material-symbols-outlined text-on-secondary-container text-3xl">auto_awesome</span>
        </div>
        <blockquote className="font-brand text-3xl md:text-4xl text-primary leading-tight mb-8">
          "Our bottles don't just hold ingredients; they hold the sunlight of the valleys and the patience of the hills."
        </blockquote>
        <p className="font-headline text-secondary font-bold tracking-widest text-sm">THE HATVONI PROMISE</p>
      </section>
    </main>
  );
}
