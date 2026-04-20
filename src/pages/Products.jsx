import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Container from '@mui/material/Container';
import { alpha, useTheme } from '@mui/material/styles';

function WishlistButton({ productId, wishlistIds, onToggle }) {
  const isActive = wishlistIds.has(productId);
  const theme = useTheme();

  return (
    <IconButton
      onClick={(e) => {
        e.preventDefault();
        onToggle(productId);
      }}
      aria-label={isActive ? 'Remove from wishlist' : 'Add to wishlist'}
      sx={{
        bgcolor: alpha(theme.palette.hatvoni.surfaceContainerLowest, 0.9),
        backdropFilter: 'blur(8px)',
        '&:hover': {
          bgcolor: theme.palette.hatvoni.surfaceContainerLowest,
          transform: 'scale(1.05)',
        },
        transition: 'all 0.2s ease',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 22,
          color: isActive ? theme.palette.error.main : theme.palette.primary.main,
          fontVariationSettings: isActive ? "'FILL' 1" : undefined,
        }}
      >
        favorite
      </span>
    </IconButton>
  );
}

function ProductCard({ product, wishlistIds, onToggleWishlist }) {
  const theme = useTheme();

  return (
    <Box component="article" sx={{ display: 'flex', flexDirection: 'column', '&:hover .product-img': { transform: 'scale(1.05)' } }}>
      <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <Box
          sx={{
            position: 'relative',
            aspectRatio: '4/5',
            overflow: 'hidden',
            borderRadius: 3,
            bgcolor: theme.palette.hatvoni.surfaceContainerLow,
            mb: 3,
          }}
        >
          <Box
            component="img"
            className="product-img"
            src={product.image_url || 'https://images.unsplash.com/photo-1582582494700-ff9fc5052dbb?auto=format&fit=crop&w=900&q=80'}
            alt={product.name}
            sx={{
              height: '100%',
              width: '100%',
              objectFit: 'cover',
              transition: 'transform 0.7s ease',
            }}
          />
          <Box sx={{ position: 'absolute', top: 16, left: 16 }}>
            <Chip
              label={product.category || 'Heritage'}
              size="small"
              sx={{
                bgcolor: theme.palette.hatvoni.secondaryContainer,
                color: theme.palette.hatvoni.onSecondaryContainer,
                fontSize: '0.625rem',
                fontWeight: 800,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                height: 26,
              }}
            />
          </Box>
          <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
            <WishlistButton productId={product.id} wishlistIds={wishlistIds} onToggle={onToggleWishlist} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="h6" sx={{ fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 800, color: 'primary.main', fontSize: '1.5rem' }}>
              {product.name}
            </Typography>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'secondary.main', whiteSpace: 'nowrap' }}>
              Rs. {Number(product.price || 0).toLocaleString()}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {product.description || 'Traditional product prepared using time-honored methods from North East India.'}
          </Typography>
        </Box>
      </Link>
      <Button
        component={Link}
        to={`/products/${product.id}`}
        fullWidth
        variant="contained"
        startIcon={<span className="material-symbols-outlined">add_shopping_cart</span>}
        sx={{
          mt: 3,
          py: 1.5,
          borderRadius: 3,
          bgcolor: theme.palette.hatvoni.primaryContainer,
          color: theme.palette.hatvoni.onPrimaryContainer,
          fontWeight: 700,
          '&:hover': {
            bgcolor: 'primary.main',
            color: 'white',
          },
        }}
      >
        View Product
      </Button>
    </Box>
  );
}

function ProductSkeleton() {
  return (
    <Box>
      <Skeleton variant="rounded" sx={{ aspectRatio: '4/5', borderRadius: 3 }} />
      <Skeleton variant="text" sx={{ mt: 3, width: '70%', height: 32 }} />
      <Skeleton variant="text" sx={{ mt: 1, width: '100%' }} />
      <Skeleton variant="text" sx={{ width: '80%' }} />
      <Skeleton variant="rounded" sx={{ mt: 3, height: 48, borderRadius: 3 }} />
    </Box>
  );
}

export default function Products() {
  const theme = useTheme();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const { user } = useAuth();

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    const loadWishlist = async () => {
      if (!user) {
        setWishlistIds(new Set());
        return;
      }

      try {
        const { data, error } = await supabase
          .from('wishlists')
          .select('product_id')
          .eq('user_id', user.id);

        if (error) throw error;
        setWishlistIds(new Set((data || []).map((item) => item.product_id)));
      } catch (error) {
        console.error('Error fetching wishlist:', error);
      }
    };

    loadWishlist();
  }, [user]);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('show_as_individual_product', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleWishlist = async (productId) => {
    if (!user) {
      alert('Please login to manage your wishlist.');
      return;
    }

    const exists = wishlistIds.has(productId);

    try {
      if (exists) {
        const { error } = await supabase
          .from('wishlists')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
        if (error) throw error;

        setWishlistIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      } else {
        const { error } = await supabase
          .from('wishlists')
          .insert({ user_id: user.id, product_id: productId });
        if (error) throw error;

        setWishlistIds((prev) => new Set([...prev, productId]));
      }
    } catch (error) {
      console.error('Error updating wishlist:', error);
    }
  };

  const categories = useMemo(() => {
    const c = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return ['all', ...c];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (activeCategory === 'all') return products;
    return products.filter((product) => product.category === activeCategory);
  }, [products, activeCategory]);

  return (
    <Container maxWidth="lg" sx={{ pt: { xs: 16, md: 20 }, pb: { xs: 8, md: 12 }, px: { xs: 3, lg: 5 } }}>
      {/* Hero Header */}
      <Box sx={{ mb: { xs: 8, md: 10 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ height: 1, width: 48, bgcolor: 'secondary.main' }} />
          <Typography variant="overline" sx={{ color: 'secondary.main' }}>
            Authentic Heritage
          </Typography>
        </Box>
        <Typography
          variant="h1"
          sx={{
            maxWidth: '800px',
            color: 'primary.main',
            fontSize: { xs: '3rem', md: '4.5rem', lg: '5rem' },
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          The Essence of <br />
          <Box component="span" sx={{ color: 'secondary.main' }}>North East India</Box>
        </Typography>
        <Typography variant="body1" sx={{ maxWidth: '600px', color: 'text.secondary', fontSize: { xs: '1.125rem', md: '1.25rem' } }}>
          Experience the soulful alchemy of traditional alkaline preparations. Sustainably harvested, naturally filtered, and rooted in the ancestral wisdom of the Seven Sisters.
        </Typography>
      </Box>

      {/* Category Filters */}
      <Box sx={{ mb: 8, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {categories.map((category) => {
          const active = category === activeCategory;
          return (
            <Chip
              key={category}
              label={category === 'all' ? 'All Products' : category}
              onClick={() => setActiveCategory(category)}
              sx={{
                px: 1,
                py: 2.5,
                fontSize: '0.875rem',
                fontWeight: active ? 700 : 500,
                fontFamily: '"Inter", sans-serif',
                borderRadius: '9999px',
                bgcolor: active ? 'primary.main' : theme.palette.hatvoni.surfaceContainerHigh,
                color: active ? 'white' : 'text.secondary',
                letterSpacing: '0.01em',
                textTransform: 'none',
                '&:hover': {
                  bgcolor: active ? 'primary.main' : theme.palette.hatvoni.secondaryContainer,
                  color: active ? 'white' : theme.palette.hatvoni.onSecondaryContainer,
                },
              }}
            />
          );
        })}
      </Box>

      {/* Lots Banner */}
      <Box
        sx={{
          mb: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          borderRadius: 4,
          border: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.25)}`,
          bgcolor: theme.palette.hatvoni.surfaceContainerLow,
          p: 2.5,
        }}
      >
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Looking for bundles? Explore curated lots and combo packs.
        </Typography>
        <Button
          component={Link}
          to="/lots"
          variant="contained"
          size="small"
          endIcon={<span className="material-symbols-outlined" style={{ fontSize: 16 }}>north_east</span>}
          sx={{
            bgcolor: '#fff',
            color: 'primary.main',
            fontWeight: 700,
            borderRadius: 3,
            px: 2,
            boxShadow: 'none',
            border: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.3)}`,
            '&:hover': {
              bgcolor: 'primary.main',
              color: 'white',
              borderColor: 'primary.main',
            },
          }}
        >
          Browse Lots
        </Button>
      </Box>

      {/* Product Grid */}
      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: { xs: 6, md: 8 } }}>
          {[1, 2, 3].map((i) => <ProductSkeleton key={i} />)}
        </Box>
      ) : filteredProducts.length === 0 ? (
        <Box
          sx={{
            borderRadius: 6,
            bgcolor: theme.palette.hatvoni.surfaceContainerLow,
            py: 10,
            textAlign: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 64, color: alpha(theme.palette.text.secondary, 0.3) }}>inventory_2</span>
          <Typography sx={{ mt: 2, fontSize: '1.125rem', color: 'text.secondary' }}>
            No products available in this category yet.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, columnGap: { xs: 4, md: 6 }, rowGap: { xs: 8, md: 10 } }}>
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              wishlistIds={wishlistIds}
              onToggleWishlist={toggleWishlist}
            />
          ))}
        </Box>
      )}

      {/* Bottom CTA */}
      <Box
        sx={{
          mt: { xs: 12, md: 16 },
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 6,
          alignItems: { md: 'center' },
          borderRadius: 6,
          bgcolor: theme.palette.hatvoni.surfaceContainerLow,
          p: { xs: 4, md: 6 },
        }}
      >
        <Box sx={{ width: { xs: '100%', md: '50%' } }}>
          <Box
            component="img"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuA8wan-l7ficzoaIjduD_ejjdkbILKx4zfsLHYMRj9mtyHajIHKqkocx3q90ikGpbWgQprNd13aWXXOBLpguig0SwYgIq7ME3k4lfK0pSFeH3u8d3D2-Ewhr5wh5kfm50V3a_JLEaano-5Ul5kIl-KhMNXREpxhQ65luHkt5prb29lk4snfgJa2hHGkp7StBSB4Nr94lhZgwV7IblP9qGhVeBz-jA89sVdJAdyfhpbfKumZPTmO9oVbsno0skVZETmLBEDNz0ttM_IK"
            alt="Hatvoni heritage ingredients"
            sx={{ borderRadius: 4, width: '100%', boxShadow: `0 20px 40px ${alpha(theme.palette.text.primary, 0.06)}` }}
          />
        </Box>
        <Box sx={{ width: { xs: '100%', md: '50%' }, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="h3" sx={{ color: 'primary.main', fontSize: '1.875rem' }}>
            More than a flavor.
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 2 }}>
            In North East Indian households, Khar is not just an ingredient. It is a ritual tied to balance, nourishment, and continuity. Every Hatvoni product supports living culinary traditions and local farming communities.
          </Typography>
          <Button
            component={Link}
            to="/about"
            variant="text"
            endIcon={<span className="material-symbols-outlined">trending_flat</span>}
            sx={{
              alignSelf: 'flex-start',
              fontWeight: 800,
              fontSize: '0.875rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'primary.main',
              px: 0,
            }}
          >
            Discover Our Story
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
