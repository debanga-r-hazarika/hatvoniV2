import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cartService } from '../services/cartService';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import { alpha, useTheme } from '@mui/material/styles';

const DELIVERY_FEE = 79;
const FREE_DELIVERY_THRESHOLD = 500;

export default function Cart() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [items, setItems] = useState(() => cartService.getCartItems());

  useEffect(() => {
    const unsubscribe = cartService.subscribe(setItems);
    return unsubscribe;
  }, []);

  const totals = useMemo(() => {
    const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0);
    const deliveryFee = itemCount > 0 ? DELIVERY_FEE : 0;
    const freeShippingDiscount = subtotal >= FREE_DELIVERY_THRESHOLD && deliveryFee > 0 ? deliveryFee : 0;
    const shipping = Math.max(0, deliveryFee - freeShippingDiscount);
    const grandTotal = subtotal + shipping;

    return {
      itemCount,
      subtotal,
      deliveryFee,
      freeShippingDiscount,
      shipping,
      grandTotal,
    };
  }, [items]);

  const updateQty = (id, delta) => {
    const current = items.find((item) => item.id === id);
    if (!current) return;
    cartService.updateCartItemQty(id, Math.max(1, current.qty + delta));
  };

  const removeItem = (id) => {
    cartService.removeCartItem(id);
  };

  const clearCart = () => {
    cartService.clearCart();
  };

  const handleCheckout = () => {
    if (items.length === 0) return;
    navigate('/checkout');
  };

  return (
    <Box component="main" sx={{ pt: { xs: 16, md: 20 }, pb: { xs: 12, md: 16 }, bgcolor: theme.palette.hatvoni.surface, minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3, lg: 4 } }}>
        {/* Header */}
        <Box
          sx={{
            mb: { xs: 5, md: 8 },
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 3,
            borderBottom: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.2)}`,
            pb: 4,
          }}
        >
          <Box>
            <Typography variant="overline" sx={{ color: 'secondary.main' }}>Your Selection</Typography>
            <Typography variant="h1" sx={{ color: 'primary.main', fontSize: { xs: '3rem', md: '4.5rem' }, letterSpacing: '-0.03em', lineHeight: 1 }}>
              Your Basket
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2, maxWidth: 500, fontWeight: 500 }}>
              Review your curated items of authentic North East Indian heritage before proceeding to secure checkout.
            </Typography>
          </Box>
          {items.length > 0 && (
            <Button
              onClick={clearCart}
              startIcon={<span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>}
              sx={{
                color: 'error.main',
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                borderRadius: 3,
                '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.05) },
              }}
            >
              Clear Basket
            </Button>
          )}
        </Box>

        <Grid container spacing={{ xs: 4, md: 7 }} alignItems="flex-start">
          {/* Cart Items */}
          <Grid size={{ xs: 12, lg: 7, xl: 8 }}>
            {items.length === 0 ? (
              <Paper
                elevation={0}
                sx={{
                  textAlign: 'center',
                  py: 12,
                  borderRadius: 6,
                  border: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.3)}`,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <Box sx={{ position: 'absolute', top: 0, right: 0, width: 192, height: 192, bgcolor: alpha(theme.palette.primary.main, 0.04), borderBottomLeftRadius: 150 }} />
                <span className="material-symbols-outlined" style={{ fontSize: 80, color: alpha(theme.palette.primary.main, 0.08), marginBottom: 24, display: 'block' }}>shopping_bag</span>
                <Typography variant="h3" sx={{ color: 'primary.main', mb: 1.5, fontSize: { xs: '1.875rem', md: '2.25rem' } }}>
                  Your basket is perfectly empty
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 400, mx: 'auto', mb: 4, fontWeight: 500 }}>
                  Fill it with traditional staples and unique heritage ingredients.
                </Typography>
                <Button
                  component={Link}
                  to="/products"
                  variant="contained"
                  startIcon={<span className="material-symbols-outlined" style={{ fontSize: 16 }}>explore</span>}
                  sx={{
                    py: 1.5,
                    px: 4,
                    borderRadius: 4,
                    fontWeight: 700,
                    fontSize: '0.6875rem',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    boxShadow: theme.shadows[3],
                  }}
                >
                  Explore Collection
                </Button>
              </Paper>
            ) : (
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 6,
                  border: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.3)}`,
                  p: { xs: 2, md: 4 },
                }}
              >
                {items.map((item, index) => (
                  <Box
                    key={item.id}
                    sx={{
                      display: 'flex',
                      gap: { xs: 2, md: 3 },
                      alignItems: 'flex-start',
                      pb: { xs: 2.5, md: 3 },
                      mb: index !== items.length - 1 ? { xs: 2.5, md: 3 } : 0,
                      borderBottom: index !== items.length - 1 ? `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.2)}` : 'none',
                      '&:hover .cart-img': { transform: 'scale(1.05)' },
                    }}
                  >
                    <Link to={item.item_type === 'lot' ? `/lots/${item.entity_id || item.lot_id}` : `/products/${item.entity_id || item.product_id}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
                      <Box
                        sx={{
                          width: { xs: 80, md: 96 },
                          aspectRatio: '1',
                          overflow: 'hidden',
                          borderRadius: 3,
                          bgcolor: theme.palette.hatvoni.surfaceContainer,
                          position: 'relative',
                        }}
                      >
                        <Box
                          component="img"
                          className="cart-img"
                          src={item.image_url || 'https://via.placeholder.com/400'}
                          alt={item.name}
                          sx={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.7s ease' }}
                        />
                      </Box>
                    </Link>

                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', py: 0.5 }}>
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                          <Box>
                            <Typography variant="overline" sx={{ color: 'secondary.main', fontSize: '0.5625rem' }}>
                              {item.item_type === 'lot' ? 'Heritage Bundle' : (item.category || 'Traditional Staple')}
                            </Typography>
                            <Typography
                              sx={{
                                fontFamily: '"Plus Jakarta Sans", sans-serif',
                                fontSize: { xs: '1.125rem', md: '1.25rem' },
                                fontWeight: 700,
                                color: 'primary.main',
                                lineHeight: 1.3,
                                display: { xs: '-webkit-box', md: 'block' },
                                WebkitLineClamp: { xs: 2, md: 'unset' },
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {item.name}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontWeight: 700, fontSize: { xs: '1rem', md: '1.125rem' }, color: 'primary.main', whiteSpace: 'nowrap' }}>
                            ₹{(Number(item.price || 0) * item.qty).toLocaleString()}
                          </Typography>
                        </Box>

                        {item.description && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                              fontStyle: 'italic',
                              fontWeight: 500,
                              mt: 0.75,
                              display: { xs: 'none', md: '-webkit-box' },
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              maxWidth: 400,
                            }}
                          >
                            {item.description}
                          </Typography>
                        )}

                        {(item.lot_items || []).length > 0 && (
                          <Paper
                            elevation={0}
                            sx={{
                              mt: 1.5,
                              p: 1.5,
                              bgcolor: theme.palette.hatvoni.surfaceContainerLowest,
                              border: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.2)}`,
                              borderRadius: 2,
                            }}
                          >
                            {(item.lot_items || []).slice(0, 3).map((bundleItem) => (
                              <Box key={`${item.id}-${bundleItem.product_key || bundleItem.id}`} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {bundleItem.products?.name || bundleItem.product_name || bundleItem.product_key}
                                </Typography>
                                <Typography variant="caption" sx={{ fontSize: '0.5625rem', flexShrink: 0 }}>×{bundleItem.quantity}</Typography>
                              </Box>
                            ))}
                            {item.lot_items?.length > 3 && (
                              <Typography variant="caption" sx={{ fontWeight: 700, color: 'secondary.main', mt: 0.5, pt: 0.5, borderTop: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.2)}`, display: 'block', fontSize: '0.5625rem', letterSpacing: '0.1em' }}>
                                + {item.lot_items.length - 3} more
                              </Typography>
                            )}
                          </Paper>
                        )}
                      </Box>

                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', pt: 1.5, mt: 'auto', gap: 2 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            bgcolor: theme.palette.hatvoni.surfaceContainer,
                            border: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.3)}`,
                            borderRadius: 3,
                            px: 1,
                            py: 0.5,
                          }}
                        >
                          <IconButton size="small" onClick={() => updateQty(item.id, -1)} aria-label="Decrease quantity" sx={{ p: 0.25 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>remove</span>
                          </IconButton>
                          <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.75rem', md: '0.875rem' }, width: 32, textAlign: 'center', letterSpacing: '0.15em' }}>
                            {item.qty}
                          </Typography>
                          <IconButton size="small" onClick={() => updateQty(item.id, 1)} aria-label="Increase quantity" sx={{ p: 0.25 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                          </IconButton>
                        </Box>

                        <Button
                          onClick={() => removeItem(item.id)}
                          startIcon={<span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>}
                          size="small"
                          sx={{
                            color: 'text.secondary',
                            fontSize: '0.5625rem',
                            fontWeight: 700,
                            letterSpacing: '0.15em',
                            textTransform: 'uppercase',
                            borderRadius: 2,
                            px: 1.5,
                            py: 0.75,
                            bgcolor: theme.palette.hatvoni.surfaceContainerLow,
                            border: '1px solid transparent',
                            '&:hover': {
                              color: 'error.main',
                              borderColor: alpha(theme.palette.error.main, 0.15),
                              bgcolor: alpha(theme.palette.error.main, 0.05),
                            },
                          }}
                        >
                          Remove
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Paper>
            )}
          </Grid>

          {/* Order Summary Sidebar */}
          <Grid size={{ xs: 12, lg: 5, xl: 4 }}>
            <Box sx={{ position: { lg: 'sticky' }, top: { lg: 160 } }}>
              <Paper
                elevation={0}
                sx={{
                  bgcolor: 'primary.main',
                  p: { xs: 3, md: 4 },
                  borderRadius: 6,
                  boxShadow: theme.shadows[6],
                  position: 'relative',
                  overflow: 'hidden',
                  border: 'none',
                }}
              >
                {/* Decorative blurs */}
                <Box sx={{ position: 'absolute', top: -80, right: -80, width: 256, height: 256, bgcolor: alpha(theme.palette.secondary.main, 0.2), borderRadius: '50%', filter: 'blur(48px)' }} />
                <Box sx={{ position: 'absolute', bottom: -80, left: -80, width: 256, height: 256, bgcolor: alpha('#fff', 0.1), borderRadius: '50%', filter: 'blur(48px)' }} />

                <Typography variant="h3" sx={{ fontWeight: 700, color: 'white', borderBottom: '1px solid rgba(255,255,255,0.2)', pb: 3, mb: 3, position: 'relative', zIndex: 1, fontSize: '1.875rem' }}>
                  Order Summary
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.9)' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 500 }}>
                    <span>Subtotal ({totals.itemCount} items)</span>
                    <Typography sx={{ fontWeight: 700, color: 'white' }}>₹{totals.subtotal.toLocaleString()}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 500 }}>
                    <span>Delivery</span>
                    <Typography sx={{ fontWeight: 700, color: 'white' }}>₹{totals.deliveryFee.toLocaleString()}</Typography>
                  </Box>
                  {totals.freeShippingDiscount > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 700, color: theme.palette.secondary.main }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>local_shipping</span>
                        Free Shipping
                      </Box>
                      <span>−₹{totals.freeShippingDiscount.toLocaleString()}</span>
                    </Box>
                  )}
                  {totals.subtotal > 0 && totals.subtotal < FREE_DELIVERY_THRESHOLD && (
                    <Paper elevation={0} sx={{ bgcolor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', p: 1.5, borderRadius: 3, mt: 1.5, border: 'none' }}>
                      <Typography variant="caption" sx={{ color: theme.palette.secondary.main, fontWeight: 600 }}>
                        Add <strong>₹{(FREE_DELIVERY_THRESHOLD - totals.subtotal).toLocaleString()}</strong> more to unlock free shipping on this order.
                      </Typography>
                    </Paper>
                  )}
                  {totals.subtotal >= FREE_DELIVERY_THRESHOLD && (
                    <Paper elevation={0} sx={{ bgcolor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', p: 1.5, borderRadius: 3, mt: 1.5, textAlign: 'center', border: 'none' }}>
                      <Typography variant="overline" sx={{ color: theme.palette.secondary.main, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                        Free shipping unlocked
                      </Typography>
                    </Paper>
                  )}
                </Box>

                <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)', my: 3 }} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 1 }}>
                  <Box>
                    <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.625rem' }}>Pay on Delivery</Typography>
                    <Typography sx={{ fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: { xs: '2.5rem', md: '3rem' }, fontWeight: 700, color: 'white', lineHeight: 1 }}>
                      ₹{totals.grandTotal.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 1.5, position: 'relative', zIndex: 1 }}>
                  <Button
                    fullWidth
                    onClick={handleCheckout}
                    disabled={items.length === 0}
                    variant="contained"
                    endIcon={<span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>}
                    sx={{
                      bgcolor: 'secondary.main',
                      color: 'white',
                      py: { xs: 1.5, md: 2 },
                      borderRadius: 4,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      fontSize: '0.6875rem',
                      boxShadow: theme.shadows[4],
                      '&:hover': { bgcolor: alpha(theme.palette.secondary.main, 0.9) },
                      '&.Mui-disabled': { opacity: 0.5 },
                    }}
                  >
                    Proceed to Checkout
                  </Button>
                  <Button
                    component={Link}
                    to="/products"
                    fullWidth
                    variant="outlined"
                    sx={{
                      color: 'white',
                      borderColor: 'rgba(255,255,255,0.2)',
                      py: 1.5,
                      borderRadius: 4,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      fontSize: '0.6875rem',
                      backdropFilter: 'blur(8px)',
                      bgcolor: 'rgba(255,255,255,0.1)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.3)' },
                    }}
                  >
                    Continue Shopping
                  </Button>
                </Box>
              </Paper>

              {/* Authenticity badge */}
              <Paper
                elevation={0}
                sx={{
                  mt: 3,
                  p: 2.5,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    bgcolor: alpha(theme.palette.success.main, 0.08),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: theme.palette.success.main, fontVariationSettings: "'FILL' 1" }}>eco</span>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: '0.05em', display: 'block', mb: 0.25 }}>
                    Authenticity Guaranteed
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, lineHeight: 1.6 }}>
                    Carefully packaged traditional ingredients. Pay exact cash directly at your doorstep on delivery.
                  </Typography>
                </Box>
              </Paper>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
