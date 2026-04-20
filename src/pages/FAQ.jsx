import { useState } from 'react';
import { Link } from 'react-router-dom';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Container from '@mui/material/Container';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Grid from '@mui/material/Grid';
import { alpha, useTheme } from '@mui/material/styles';

const faqs = [
  {
    question: "Where do your ingredients come from?",
    answer: "Every jar of Hatvoni is sourced directly from small-scale farmers across the Seven Sisters. We prioritize traditional forest-farming methods that have been passed down for generations."
  },
  {
    question: "Is your packaging biodegradable?",
    answer: "Yes. We use recyclable glass containers and our outer packaging is made from unbleached handmade paper from the region, minimizing our environmental footprint."
  },
  {
    question: "How long does shipping take?",
    answer: "Domestic orders typically arrive within 5-7 business days. Due to the remote locations of some of our partner farms, preparation may take an extra 48 hours to ensure freshness."
  },
  {
    question: "Can I visit the farms?",
    answer: "We are currently developing our 'Heritage Trail' program. Join our newsletter to be the first to know about curated farm-stay experiences."
  },
  {
    question: "Are your products 100% organic?",
    answer: "Yes. All our farmers practice age-old natural farming techniques. No chemical pesticides or synthetic fertilizers are ever used in the growth or processing of Hatvoni offerings."
  },
  {
    question: "What does \"Hatvoni\" mean?",
    answer: "Hatvoni represents the harmony between tradition and modern nutrition. It is a tribute to the agrarian wisdom passed down through generations in the Himalayan foothills."
  },
];

const categories = [
  { icon: 'local_shipping', label: 'Shipping' },
  { icon: 'verified', label: 'Quality' },
  { icon: 'payments', label: 'Refunds' },
  { icon: 'eco', label: 'Organic' },
];

export default function FAQ() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(0);

  const handleChange = (index) => (_, isExpanded) => {
    setExpanded(isExpanded ? index : -1);
  };

  return (
    <Box component="main" sx={{ minHeight: '100vh' }}>
      {/* Hero */}
      <Box
        component="header"
        sx={{
          position: 'relative',
          pt: { xs: 14, md: 16 },
          pb: { xs: 8, md: 12 },
          px: { xs: 3, md: 4 },
          bgcolor: theme.palette.hatvoni.surface,
          overflow: 'hidden',
        }}
      >
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: { xs: 'flex-start', md: 'center' },
              gap: { xs: 5, md: 8 },
            }}
          >
            <Box sx={{ flex: 1, position: 'relative', zIndex: 10 }}>
              <Typography
                variant="h1"
                sx={{
                  color: 'primary.main',
                  fontSize: { xs: '2.5rem', md: '4.5rem' },
                  textTransform: 'uppercase',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  mb: 2,
                }}
              >
                Support<br />Center
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 500, maxWidth: 420, fontSize: { xs: '1rem', md: '1.125rem' } }}>
                How can we help you preserve the heritage of North East India today?
              </Typography>
            </Box>
            <Box sx={{ flex: 1, width: '100%' }}>
              <Box
                component="img"
                alt="Traditional Spices"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDGr7HIijnnNV-0RmTt_qJ4bLaIzxzjFI1ZurtgJVEDBu6EmKa8X0m1q0mi5XFsoT8SqVYtUYpGDc3dPpUWCIyWkHNeURaEz_OCCkWBPkGaCBB0sK4SYYDUoXPM1y1-To3yan1IydYxekRku4e9bIczlpL4YZuQk5rSQ0ySZyLPxrssHmb-PvxP592t6j0pBKM_0XDPhvFp4GKOGbS6Dfmh3Tdp9CsFA1Y2Ib1Jc4wfg6aJ8kIf3He4ixIy953Fd11vga2K4FskWEZA"
                sx={{
                  borderRadius: 3,
                  width: '100%',
                  height: { xs: 220, md: 400 },
                  objectFit: 'cover',
                  boxShadow: theme.shadows[4],
                }}
              />
            </Box>
          </Box>
        </Container>
      </Box>

      {/* Category Chips */}
      <Box sx={{ px: { xs: 3, md: 4 }, py: 4, bgcolor: theme.palette.hatvoni.surfaceContainerLow }}>
        <Container maxWidth="md">
          <Grid container spacing={1.5}>
            {categories.map((cat, i) => (
              <Grid size={{ xs: 6, md: 3 }} key={cat.label}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    bgcolor: i === 1
                      ? theme.palette.hatvoni.primaryContainer
                      : i === 2
                      ? theme.palette.hatvoni.secondaryContainer
                      : theme.palette.hatvoni.surfaceContainerLow,
                    color: i === 1
                      ? theme.palette.hatvoni.onPrimaryContainer
                      : i === 2
                      ? theme.palette.hatvoni.onSecondaryContainer
                      : 'text.primary',
                    '&:active': { transform: 'scale(0.95)' },
                    '&:hover': { boxShadow: theme.shadows[2] },
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 32, marginBottom: 8 }}>{cat.icon}</span>
                  <Typography variant="overline" sx={{ fontWeight: 700 }}>{cat.label}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* FAQ Accordion */}
      <Box sx={{ py: { xs: 6, md: 10 }, px: { xs: 3, md: 4 }, bgcolor: theme.palette.hatvoni.surfaceContainerLow }}>
        <Container maxWidth="md">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
            <Box sx={{ width: 48, height: 4, bgcolor: theme.palette.hatvoni.tertiary, borderRadius: 1 }} />
            <Typography variant="h5" sx={{ color: 'primary.main' }}>Common Questions</Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1, md: 1.5 } }}>
            {faqs.map((faq, index) => (
              <Accordion
                key={index}
                expanded={expanded === index}
                onChange={handleChange(index)}
                sx={{
                  bgcolor: theme.palette.hatvoni.surface,
                  '&.Mui-expanded': { boxShadow: theme.shadows[1] },
                }}
              >
                <AccordionSummary
                  expandIcon={
                    <span className="material-symbols-outlined" style={{ color: theme.palette.primary.main }}>expand_more</span>
                  }
                  sx={{
                    minHeight: { xs: 56, md: 64 },
                    '& .MuiAccordionSummary-content': { my: { xs: 1.5, md: 2 } },
                  }}
                >
                  <Typography sx={{ fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 700, fontSize: { xs: '1rem', md: '1.125rem' }, pr: 2 }}>
                    {faq.question}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 3, pb: 3 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.8 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Contact CTA */}
      <Box sx={{ px: { xs: 3, md: 4 }, py: { xs: 6, md: 10 }, bgcolor: theme.palette.hatvoni.surface }}>
        <Container maxWidth="md">
          <Paper
            elevation={0}
            sx={{
              p: { xs: 4, md: 6 },
              borderRadius: 6,
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
              bgcolor: theme.palette.hatvoni.surfaceContainerLow,
            }}
          >
            <Box sx={{ position: 'absolute', top: 0, right: 0, width: 96, height: 96, bgcolor: alpha(theme.palette.hatvoni.tertiaryContainer, 0.1), borderBottomLeftRadius: '100%' }} />
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: theme.palette.secondary.main, marginBottom: 16, display: 'block' }}>support_agent</span>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1.5 }}>
              Still have questions?
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
              Our heritage consultants are available Monday to Friday to assist you.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, justifyContent: 'center' }}>
              <Button
                href="mailto:support@hatvoni.com"
                variant="contained"
                startIcon={<span className="material-symbols-outlined" style={{ fontSize: 16 }}>mail</span>}
                sx={{
                  bgcolor: theme.palette.hatvoni.primaryContainer,
                  color: theme.palette.hatvoni.onPrimaryContainer,
                  py: 1.5,
                  px: 4,
                  borderRadius: 3,
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  '&:hover': { bgcolor: 'primary.main', color: 'white' },
                }}
              >
                Email Support
              </Button>
              <Button
                component={Link}
                to="/contact"
                variant="outlined"
                startIcon={<span className="material-symbols-outlined" style={{ fontSize: 16 }}>chat_bubble</span>}
                sx={{
                  py: 1.5,
                  px: 4,
                  borderRadius: 3,
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  borderColor: alpha(theme.palette.hatvoni.outlineVariant, 0.3),
                  color: 'text.primary',
                  '&:hover': { bgcolor: theme.palette.hatvoni.surfaceVariant, borderColor: theme.palette.hatvoni.outlineVariant },
                }}
              >
                Live Chat
              </Button>
            </Box>
          </Paper>
        </Container>
      </Box>

      {/* Gallery Grid */}
      <Box sx={{ pb: { xs: 8, md: 12 }, px: { xs: 3, md: 4 }, bgcolor: theme.palette.hatvoni.surface }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 1.5, md: 2 }}>
            {[
              "https://lh3.googleusercontent.com/aida-public/AB6AXuCKGJAn3VEEpv9kx37BvdmTq6ksp5oBLGNGkz7-oj082mrxotOr8BWVsg95N5EIop_kfOyMOuf-iDDXaXA4dLfxudKn3cK73AJfcU96BhBOyHS7FAiXXgMPhE1GazgJELDDAkiCTMFhRDr0PHiR8xFk4cUkr1YWlzFPP9jObpi9eNm_tCFoNPitcJCT5P4cs0eLuY3yiJY8FDhZ2fcYwy7KzEZU0odw_-4-QRXWmNHki_VSDIFa0MZAQXfTOoZxeAAH6lQclL8JTRGi",
              "https://lh3.googleusercontent.com/aida-public/AB6AXuCPbh_4MQtxen0yvIhC9DEvuMhRkp11cwvmuH-cDn1MnKuDCu8y3w54Z12uf5HD6u6YSy706-CT1gpLlC9AxPvnEG3Ko6gMQAAARTgHxtLn99cxCppUAAc7PaB6EmnB-5DuLN9Sjn4tfso_jVRqcrBi7YEL8Chbm4DZ9G01nXo-LOHPMj1zd7RM6qPZVVXhckv1OKlg-CpeJzql5rsXb3YW4eMGfyAcPT73y_nm3JoV9tpsPhj3DIlyarB6g6TQlrXsjBsIkXcx50fG",
              "https://lh3.googleusercontent.com/aida-public/AB6AXuDnvzFxItcUPIGjp4RuS2x38mUkwJ7dzsQMYvXisYM25i7mB-s-IpK3nVjkXz1z68V6qCQgqRDu_HjgrVS1XPy3EV8Cfe4043rTX499ZWg4VJmSxddytGSmPOsSunKV5ymPArILljnWUr5moUam7tasw_tLztcpSrVjSKFbWjYjL5E69krAwGgKacVNXUrEOdAlxrZrsmaQ8ZFjTfERGpGs0ryJe_l5F9SHtmvBO3Pvm15hK_V5Lc9EnGBKppz2_A00NNYPhCgQldXk",
              "https://lh3.googleusercontent.com/aida-public/AB6AXuBoeo56mGbqbflKRBCv7VDFAObStQgWPnkREsLE71anqkjGUg3BqV1kRvpBIORop9_evRouAJ0I79orqLwUnwqgDfLcdnjgsecK6PqE4jpAUSVhnZ-sC4eSX73IC-JlgVetrjfotc7FUbI_HxxVp7VHn5ZQSNDlP78xOEcDVzMxOQamWYtJCjI2JFDRppSXxHvNmgNbd4Q1nB0iqxpwf53tuV7p6ZKqRdpp5LI3OTCdPWzQWf0BdEBaIPRscWgm9O41P_enJUTz_UW4",
            ].map((src, i) => (
              <Grid size={{ xs: 6, md: 3 }} key={i}>
                <Box
                  component="img"
                  src={src}
                  alt={`Heritage ${i}`}
                  sx={{
                    width: '100%',
                    height: { xs: 160, md: 260 },
                    objectFit: 'cover',
                    borderRadius: 2,
                    mt: i % 2 !== 0 ? { xs: 2, md: 8 } : 0,
                  }}
                />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
