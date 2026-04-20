import { Link } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import { alpha, useTheme } from '@mui/material/styles';

const footerSections = [
  {
    title: 'Explore',
    links: [
      { to: '/', label: 'HOME' },
      { to: '/products', label: 'OUR PRODUCTS' },
      { to: '/traditions', label: 'TRADITIONS' },
      { to: '/recipes', label: 'RECIPE' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { to: '/gallery', label: 'GALLERY' },
      { to: '/about', label: 'ABOUT US' },
      { to: '/wholesale', label: 'WHOLESALE' },
    ],
  },
  {
    title: 'Support',
    links: [
      { to: '/faq', label: 'FAQ' },
      { to: '/returns-shipping', label: 'SHIPPING & RETURNS' },
      { to: '/privacy-policy', label: 'PRIVACY POLICY' },
      { to: '/terms-conditions', label: 'TERMS OF SERVICE' },
    ],
  },
];

const socialLinks = [
  {
    label: 'Facebook',
    path: 'M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z',
  },
  {
    label: 'Instagram',
    path: 'M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z',
  },
  {
    label: 'X (Twitter)',
    path: 'M13.6823 10.6218L20.2391 3H18.6854L12.9921 9.61788L8.44486 3H3.2002L10.0765 13.0074L3.2002 21H4.75404L10.7663 14.0113L15.5685 21H20.8131L13.6819 10.6218H13.6823ZM11.5541 13.0956L10.8574 12.0991L5.31391 4.16971H7.70053L12.1742 10.5689L12.8709 11.5655L18.6861 19.8835H16.2995L11.5541 13.096V13.0956Z',
  },
];

export default function Footer() {
  const theme = useTheme();
  const primaryGreen = '#004A2B';
  const mintText = '#8bdeab';
  const goldAccent = theme.palette.hatvoni.secondaryContainer;
  const dividerColor = '#277855';

  return (
    <Box
      component="footer"
      sx={{
        width: '100%',
        bgcolor: primaryGreen,
        pt: { xs: 8, md: 10 },
        pb: { xs: 4, md: 5 },
        fontFamily: '"Plus Jakarta Sans", sans-serif',
      }}
    >
      <Box sx={{ maxWidth: '1536px', mx: 'auto', px: { xs: 3, md: 6 } }}>
        <Grid container spacing={{ xs: 5, lg: 4 }}>
          {/* Brand Column */}
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Box sx={{ pr: { lg: 4 } }}>
              <Link to="/" style={{ display: 'block', marginBottom: 16 }}>
                <Box
                  component="img"
                  src="/logo/footer-logo-white.png"
                  alt="Hatvoni"
                  sx={{
                    height: { xs: 66, sm: 75 },
                    objectFit: 'contain',
                    objectPosition: 'left',
                  }}
                />
              </Link>
              <Typography
                sx={{
                  fontWeight: 700,
                  color: '#fff',
                  fontSize: '0.8125rem',
                  letterSpacing: '0.2em',
                  mb: 2,
                  fontFamily: '"Plus Jakarta Sans", sans-serif',
                }}
              >
                STORIES FROM SEVEN SISTERS
              </Typography>
              <Typography
                sx={{
                  color: mintText,
                  fontSize: '0.9375rem',
                  lineHeight: 1.7,
                  maxWidth: 340,
                  fontFamily: '"Inter", sans-serif',
                }}
              >
                Preserving the ancestral culinary wisdom and artisanal heritage of the North Eastern frontier. Every product is a story woven with heart.
              </Typography>
            </Box>
          </Grid>

          {/* Link Sections */}
          {footerSections.map((section) => (
            <Grid size={{ xs: 6, lg: 2 }} key={section.title}>
              <Typography
                sx={{
                  fontFamily: '"Plus Jakarta Sans", sans-serif',
                  color: goldAccent,
                  fontSize: { xs: '1.25rem', md: '1.375rem' },
                  fontWeight: 600,
                  mb: 3,
                  letterSpacing: '0.03em',
                }}
              >
                {section.title}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {section.links.map((link) => (
                  <Box component="li" key={link.label}>
                    <Link
                      to={link.to}
                      style={{
                        textDecoration: 'none',
                        color: mintText,
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        letterSpacing: '0.2em',
                        transition: 'color 0.2s ease',
                        fontFamily: '"Inter", sans-serif',
                      }}
                      onMouseEnter={(e) => (e.target.style.color = '#fff')}
                      onMouseLeave={(e) => (e.target.style.color = mintText)}
                    >
                      {link.label}
                    </Link>
                  </Box>
                ))}
              </Box>
            </Grid>
          ))}

          {/* Connect */}
          <Grid size={{ xs: 12, lg: 2 }}>
            <Typography
              sx={{
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                color: goldAccent,
                fontSize: { xs: '1.25rem', md: '1.375rem' },
                fontWeight: 600,
                mb: 3,
                letterSpacing: '0.03em',
              }}
            >
              Connect
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, mb: 4 }}>
              {socialLinks.map((social) => (
                <IconButton
                  key={social.label}
                  href="#"
                  aria-label={social.label}
                  sx={{
                    color: '#fff',
                    p: 0.75,
                    '&:hover': { color: goldAccent },
                    transition: 'color 0.2s ease',
                  }}
                >
                  <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" d={social.path} clipRule="evenodd" />
                  </svg>
                </IconButton>
              ))}
            </Box>
            <Typography
              sx={{
                color: mintText,
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                lineHeight: 1.7,
                fontFamily: '"Inter", sans-serif',
              }}
            >
              CONTACT US AT:<br />
              <Box
                component="a"
                href="mailto:HELLO@HATVONI.COM"
                sx={{
                  color: mintText,
                  textDecoration: 'none',
                  transition: 'color 0.2s ease',
                  '&:hover': { color: '#fff' },
                }}
              >
                HELLO@HATVONI.COM
              </Box>
            </Typography>
          </Grid>
        </Grid>

        {/* Divider */}
        <Divider sx={{ borderColor: dividerColor, mt: 8, mb: 4 }} />

        {/* Bottom Row */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Typography
            sx={{
              color: goldAccent,
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            © 2024 HATVONI HERITAGE. MADE WITH HEART FOR TRADITION.
          </Typography>
          <Box sx={{ display: 'flex', gap: 3 }}>
            {[
              { to: '/privacy-policy', label: 'PRIVACY' },
              { to: '/terms-conditions', label: 'TERMS' },
              { label: 'COOKIES', href: '#' },
            ].map((link) =>
              link.to ? (
                <Link
                  key={link.label}
                  to={link.to}
                  style={{
                    textDecoration: 'none',
                    color: mintText,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    transition: 'color 0.2s ease',
                    fontFamily: '"Inter", sans-serif',
                  }}
                  onMouseEnter={(e) => (e.target.style.color = '#fff')}
                  onMouseLeave={(e) => (e.target.style.color = mintText)}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  style={{
                    textDecoration: 'none',
                    color: mintText,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    transition: 'color 0.2s ease',
                    fontFamily: '"Inter", sans-serif',
                  }}
                  onMouseEnter={(e) => (e.target.style.color = '#fff')}
                  onMouseLeave={(e) => (e.target.style.color = mintText)}
                >
                  {link.label}
                </a>
              )
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
