import React, { useState, useEffect, useMemo } from 'react';
import { 
  Container, 
  Grid, 
  Typography, 
  Card, 
  CardContent, 
  CardMedia, 
  Box,
  CircularProgress,
  Button,
  CardActions,
  Fade,
  Paper,
  InputBase,
  IconButton,
  Tabs,
  Tab
} from '@mui/material';
import { 
  Info as InfoIcon,
  AddShoppingCart as AddCartIcon,
  LocalOffer as OfferIcon,
  Search as SearchIcon,
  HomeOutlined,
  ElectricalServices,
  Checkroom,
  Toys
} from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import Footer from './Footer';

const DEFAULT_FALLBACK_IMAGE = 'https://images.pexels.com/photos/5632402/pexels-photo-5632402.jpeg?auto=compress&cs=tinysrgb&w=300';

// Add a helper for localStorage management
const storageManager = {
  // Get data from localStorage safely
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`Error getting ${key} from localStorage:`, error);
      return null;
    }
  },
  
  // Set data in localStorage with error handling
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`Error setting ${key} in localStorage:`, error);
      
      // If storage is full, try to clear some space
      if (error.name === 'QuotaExceededError' || error.code === 22) {
        storageManager.cleanup();
        
        // Try one more time after cleanup
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (retryError) {
          console.error('Still cannot store data after cleanup:', retryError);
          return false;
        }
      }
      return false;
    }
  },
  
  // Clean up old or less important data
  cleanup: () => {
    try {
      // Find keys that can be safely removed
      const keysToRemove = [];
      
      // Identify keys that can be deleted (based on your app's needs)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        // Check if it's a cache key or has "cache" in the name
        if (key.includes('cache') || key.includes('temp') || key.includes('products')) {
          keysToRemove.push(key);
        }
      }
      
      // Remove the identified keys
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // Continue with other keys if one fails
        }
      });
      
      console.log(`Cleaned up ${keysToRemove.length} items from localStorage`);
    } catch (error) {
      console.error('Error cleaning up localStorage:', error);
    }
  }
};

const HomePage = ({ isAuthenticated, searchTerm }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [currentOfferIndex, setCurrentOfferIndex] = useState(0);
  const [error, setError] = useState(null);
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Memoize special offers to prevent unnecessary re-renders
  const specialOffers = useMemo(() => [
    {
      title: "Flash Sale! 🎉",
      description: "50% OFF on all Electronics - Limited Time Only!",
      color: "#ff4081"
    },
    {
      title: "Weekend Special! 🌟",
      description: "Buy 1 Get 1 Free on Fashion Items",
      color: "#7c4dff"
    },
    {
      title: "New User Offer! 🎁",
      description: "Get $20 OFF on your first purchase",
      color: "#00bcd4"
    },
    {
      title: "Clearance Sale! 💫",
      description: "Up to 70% OFF on Selected Items",
      color: "#ff5722"
    }
  ], []);

  // Rotate offers every 3 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentOfferIndex((prevIndex) => 
        prevIndex === specialOffers.length - 1 ? 0 : prevIndex + 1
      );
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  // Get search term directly from URL as well as props
  useEffect(() => {
    // Prioritize the URL search term
    const urlSearchTerm = searchParams.get('search') || '';
    
    console.log("HomePage search term synchronization:", {
      urlSearchTerm, 
      propSearchTerm: searchTerm,
      currentLocalTerm: localSearchTerm
    });
    
    // Always update local search term to match the parent component's state
    if (searchTerm !== localSearchTerm) {
      setLocalSearchTerm(searchTerm || '');
    }
    // If URL has a search term that doesn't match the local state
    else if (urlSearchTerm && urlSearchTerm !== localSearchTerm) {
      setLocalSearchTerm(urlSearchTerm);
    }
  }, [searchParams, searchTerm, localSearchTerm]);

  // Sample product data for non-authenticated users
  const sampleProductsData = useMemo(() => {
    const categories = [
      // All categories (Electronics, Fashion, Toys) removed
    ];
    
    // Update the placeholder images arrays with more reliable URLs
    // Better placeholder images with category matching
    const placeholderImages = [
      // All placeholder images removed
    ];
    
    // Default fallback image for all categories
    const defaultFallbackImage = DEFAULT_FALLBACK_IMAGE;

    // Return empty categories
    return categories;
  }, []);

  const handleCategoryChange = (event, newValue) => {
    setActiveCategory(newValue);
  };

  useEffect(() => {
    const fetchAllProducts = async () => {
      if (!isAuthenticated) {
        // We'll now show sample products even for non-authenticated users
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // Create a products cache key based on timestamp
        const cacheKey = 'homepage_products';
        const cacheExpiry = 5 * 60 * 1000; // 5 minutes
        
        // Try to get cached data first using our storage manager
        const cachedData = storageManager.get(cacheKey);
        if (cachedData) {
          try {
            const { data, timestamp } = JSON.parse(cachedData);
            if (Date.now() - timestamp < cacheExpiry) {
              setProducts(data);
              setLoading(false);
              // Fetch fresh data in background
              fetchFreshData();
              return;
            }
          } catch (parseError) {
            console.warn('Error parsing cached data:', parseError);
            // If parsing fails, we'll continue to fetch fresh data
          }
        }

        // If no valid cache or cache error, fetch fresh data
        await fetchFreshData();

      } catch (error) {
        console.error('Error fetching products:', error);
        setError('Failed to load products. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    const fetchFreshData = async () => {
      try {
        // Fetch all sellers with active status
        const sellersRef = collection(db, 'sellers');
        const sellersQuery = query(sellersRef, where('status', '==', 'active'));
        const sellersSnapshot = await getDocs(sellersQuery);
        
        // Process all sellers data at once
        const sellersData = sellersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Collect all product IDs first
        const productIds = sellersData.reduce((acc, seller) => {
          if (seller.products && Array.isArray(seller.products)) {
            acc.push(...seller.products);
          }
          return acc;
        }, []);

        // Create a map of seller data for quick lookup
        const sellerMap = sellersData.reduce((acc, seller) => {
          acc[seller.id] = {
            shopName: seller.shopName,
            name: seller.name
          };
          return acc;
        }, {});

        // Batch fetch products in groups of 10
        const batchSize = 10;
        const productPromises = [];
        
        for (let i = 0; i < productIds.length; i += batchSize) {
          const batch = productIds.slice(i, i + batchSize);
          const batchPromises = batch.map(async (productId) => {
            const productDoc = await getDoc(doc(db, 'products', productId));
            if (productDoc.exists()) {
              const sellerId = sellersData.find(s => s.products?.includes(productId))?.id;
              return {
                id: productDoc.id,
                ...productDoc.data(),
                seller: sellerId ? {
                  id: sellerId,
                  ...sellerMap[sellerId]
                } : null
              };
            }
            return null;
          });
          productPromises.push(...batchPromises);
        }

        // Wait for all product fetches to complete
        const productsResults = await Promise.all(productPromises);
        const validProducts = productsResults.filter(p => p !== null);

        // Set all products in state for the current session
        setProducts(validProducts);

        // For localStorage, limit to a reasonable number of products to prevent quota errors
        // Only store the most recent products (up to 50)
        const maxProductsToCache = 50;
        const sortedProducts = [...validProducts]
          .sort((a, b) => {
            // Sort by createdAt timestamp if available, newest first
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          })
          .slice(0, maxProductsToCache);

        // Only store essential data to reduce size
        const trimmedProducts = sortedProducts.map(product => ({
          id: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          category: product.category,
          seller: product.seller ? {
            id: product.seller.id,
            shopName: product.seller.shopName,
            name: product.seller.name
          } : null,
          createdAt: product.createdAt
        }));

        // Use our storage manager to safely store the data
        storageManager.set('homepage_products', JSON.stringify({
          data: trimmedProducts,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('Error fetching fresh data:', error);
        // Don't throw here, just log the error and return
        // This allows the app to continue working even if fetching fails
      }
    };

    fetchAllProducts();
  }, [isAuthenticated]);

  // Modified to show sample products for non-authenticated users
  const displayProductsWithKeys = useMemo(() => {
    if (!isAuthenticated) {
      // For non-authenticated users, filter the sample products
      let allProducts = sampleProductsData.flatMap(cat => cat.products);
      
      if (localSearchTerm) {
        const searchLower = localSearchTerm.toLowerCase().trim();
        allProducts = allProducts.filter(product => 
          product.name.toLowerCase().includes(searchLower) || 
          product.category.toLowerCase().includes(searchLower) ||
          product.description.toLowerCase().includes(searchLower)
        );
      }
      
      return allProducts;
    }
    
    // For authenticated users, continue using real products
    const filtered = products
      .filter(product => {
        if (!localSearchTerm) return true;
        const searchLower = localSearchTerm.toLowerCase().trim();
        return (
          (product.name && product.name.toLowerCase().includes(searchLower)) ||
          (product.description && product.description.toLowerCase().includes(searchLower)) ||
          (product.category && product.category.toLowerCase().includes(searchLower)) ||
          (product.seller?.shopName && product.seller.shopName.toLowerCase().includes(searchLower))
        );
      })
      .filter(product => product && product.name && product.price)
      .sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
    
    // Assign stable unique keys to each product
    return filtered.map((product, index) => ({
      ...product,
      uniqueKey: `product-${product.id || ''}-${index}`
    }));
  }, [products, localSearchTerm, isAuthenticated, sampleProductsData]);

  // Get the products for the current category (for non-authenticated users)
  const currentCategoryProducts = useMemo(() => {
    if (isAuthenticated) return displayProductsWithKeys;
    
    if (localSearchTerm) return displayProductsWithKeys;
    
    return sampleProductsData[activeCategory]?.products || [];
  }, [isAuthenticated, displayProductsWithKeys, sampleProductsData, activeCategory, localSearchTerm]);

  const handleProductClick = (productId) => {
    navigate(`/product/${productId}`);
  };

  const handleDetailsClick = (e, productId) => {
    e.stopPropagation(); // Prevent card click
    navigate(`/product/${productId}`);
  };

  const handleAddToCart = async (e, product) => {
    e.stopPropagation(); // Prevent card click
    
    if (!auth.currentUser) {
      alert('Please login to add products to cart');
      navigate('/customer/login');
      return;
    }

    try {
      // Get current customer data to ensure we have the latest cart
      const customerRef = doc(db, 'customers', auth.currentUser.uid);
      const customerDoc = await getDoc(customerRef);
      
      if (!customerDoc.exists()) {
        throw new Error('Customer data not found');
      }
      
      const customerData = customerDoc.data();
      const currentCart = customerData.cart || [];
      
      // Check if product is already in cart
      const existingProduct = currentCart.find(item => item.id === product.id);
      
      let updatedCart;
      if (existingProduct) {
        // Update quantity if product already exists
        updatedCart = currentCart.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      } else {
        // Add new product to cart
        const cartItem = {
          id: product.id,
          name: product.name,
          price: product.price || 0,
          imageUrl: product.imageUrl || DEFAULT_FALLBACK_IMAGE,
          quantity: 1,
          seller: product.seller || null
        };
        updatedCart = [...currentCart, cartItem];
      }
      
      // Update in Firestore
      await updateDoc(customerRef, {
        cart: updatedCart
      });
      
      alert('Product added to cart successfully!');
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert('Failed to add product to cart. Please try again.');
    }
  };

  // Handle search input change in mobile search
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setLocalSearchTerm(value);
  };
  
  // Handle search submission
  const handleSearchSubmit = () => {
    if (localSearchTerm.trim()) {
      console.log("Direct navigation with search:", localSearchTerm.trim());
      // Use direct navigation instead of React Router to avoid state sync issues
      window.location.href = `/?search=${encodeURIComponent(localSearchTerm.trim())}`;
    } else {
      window.location.href = '/';
    }
  };
  
  // Handle search key press (Enter)
  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchSubmit();
    }
  };
  
  // Handle clearing search
  const handleClearSearch = () => {
    setLocalSearchTerm('');
    window.location.href = '/';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Container maxWidth="xl" sx={{ mt: 10, mb: 5 }}>
        {/* Banner Carousel */}
        <Box sx={{   position: 'relative', width: '80%',mb: 4, borderRadius: 2, overflow: 'hidden', boxShadow: 3 }}>
          <Box sx={{ position: 'relative' }}>
            <Box
              component="img"
              src="https://images.pexels.com/photos/4792720/pexels-photo-4792720.jpeg?auto=compress&cs=tinysrgb&w=1260"
              alt="Fashion banner"
              sx={{
                width: '100%',
                height: { xs: 200, sm: 300 },
                objectFit: 'cover',
                filter: 'brightness(0.8)',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '80%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                p: { xs: 2, sm: 4 },
                background: 'linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 100%)',
              }}
            >
              <Box
                sx={{
                  bgcolor: 'white',
                  color: '#FF0000',
                  p: 1,
                  borderRadius: 1,
                  display: 'inline-block',
                  mb: 1,
                  fontWeight: 'bold',
                  fontSize: { xs: 12, sm: 14 },
                }}
              >
                100% Authentic
              </Box>
              <Typography 
                variant="h4" 
                component="h1" 
                sx={{ 
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: { xs: '1.5rem', sm: '2rem', md: '2.5rem' },
                  textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                  mb: 0.5,
                }}
              >
                ONE DAY SPECIAL:
              </Typography>
              <Typography 
                variant="h3" 
                component="h2" 
                sx={{ 
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
                  textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                  mb: 2,
                }}
              >
                UP TO 50% OFF
              </Typography>
              
              <Box 
                sx={{ 
                  display: 'flex', 
                  gap: 2,
                  flexWrap: 'wrap',
                }}
              >
                <Box
                  sx={{
                    bgcolor: 'black',
                    color: 'white',
                    p: 1,
                    textAlign: 'center',
                    width: { xs: 130, sm: 160 },
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: { xs: 12, sm: 14 } }}>
                    25% off with
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: { xs: 12, sm: 14 } }}>
                    min. spend $150
                  </Typography>
                </Box>
                <Box
                  sx={{
                    bgcolor: 'black',
                    color: 'white',
                    p: 1,
                    textAlign: 'center',
                    width: { xs: 130, sm: 160 },
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: { xs: 12, sm: 14 } }}>
                    Buy 3,
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: { xs: 12, sm: 14 } }}>
                    get 15% off
                  </Typography>
                </Box>
              </Box>
            </Box>
            
            {/* Carousel Navigation */}
            <Box sx={{ position: 'absolute', bottom: 10, left: 0, width: '100%', display: 'flex', justifyContent: 'center', gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'white', opacity: 0.7 }} />
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'white', opacity: 0.7 }} />
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#FF4D33', opacity: 1 }} />
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'white', opacity: 0.7 }} />
            </Box>
            
            {/* Left/Right Arrows */}
            <Box sx={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', 
                bgcolor: 'rgba(255,255,255,0.5)', borderRadius: '50%', width: 30, height: 30, 
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Typography sx={{ fontSize: 20 }}>&lt;</Typography>
            </Box>
            <Box sx={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', 
                bgcolor: 'rgba(255,255,255,0.5)', borderRadius: '50%', width: 30, height: 30, 
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Typography sx={{ fontSize: 20 }}>&gt;</Typography>
            </Box>
          </Box>
          
        
        </Box>

  {/* Todays Deal Banner - Right Side */}
  <Box 
            sx={{ 
              position: 'absolute', 
              top: { xs: 'auto', md: 0 }, 
              bottom: { xs: 0, md: 'auto' },
              right: 0, 
              mr:10,
              width: { xs: '100%', sm: '180px' }, 
              height: { xs: '62%', sm: '62%%' },
              maxWidth: { xs: '100%', sm: '180px' },
              bgcolor: '#FFF4EF',
              mt:'140px',
              overflow: 'hidden',
              display: { xs: 'none', md: 'block' },
              zIndex: 1
            }}
          >
            <Box sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" component="h3" fontWeight="bold" sx={{ mb: 1, color: '#333', textAlign: 'center' }}>
                Todays Deal <Box component="span" sx={{ bgcolor: 'red', color: 'white', fontSize: '0.7rem', p: 0.5, borderRadius: 1, ml: 0.5 }}>Hot</Box>
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto', height: 'calc(100% - 40px)' }}>
                {/* Deal Product 1 */}
                <Box sx={{ bgcolor: 'white', p: 1, borderRadius: 1, border: '1px solid #FF6347', cursor: 'pointer' }}>
                  <Box sx={{ mb: 1 }}>
                    <img 
                      src="https://m.media-amazon.com/images/I/71ctRE34RuL._AC_UF894,1000_QL80_.jpg" 
                      alt="Boston t-shirt" 
                      style={{ width: '100%', height: 'auto', objectFit: 'contain' }} 
                    />
                  </Box>
                  <Typography color="error" fontWeight="bold" sx={{ fontSize: '1rem' }}>
                    $8.98
                  </Typography>
                  <Typography sx={{ textDecoration: 'line-through', fontSize: '0.8rem', color: 'text.secondary' }}>
                    $9.48
                  </Typography>
                </Box>
                
                {/* Deal Product 2 */}
                <Box sx={{ bgcolor: 'white', p: 1, borderRadius: 1, border: '1px solid #eaeaea', cursor: 'pointer' }}>
                  <Box sx={{ mb: 1 }}>
                    <img 
                      src="https://images.pexels.com/photos/5961984/pexels-photo-5961984.jpeg?auto=compress&cs=tinysrgb&w=80" 
                      alt="Blue jacket" 
                      style={{ width: '100%', height: 'auto', objectFit: 'contain' }} 
                    />
                  </Box>
                  <Typography color="error" fontWeight="bold" sx={{ fontSize: '1rem' }}>
                    $27.14
                  </Typography>
                  <Typography sx={{ textDecoration: 'line-through', fontSize: '0.8rem', color: 'text.secondary' }}>
                    $27.64
                  </Typography>
                </Box>
                
                {/* Deal Product 3 */}
                <Box sx={{ bgcolor: 'gold', p: 1, borderRadius: 1, border: '1px solid #eaeaea', cursor: 'pointer' }}>
                  <Box sx={{ mb: 1 }}>
                    <img 
                      src="https://images.pexels.com/photos/4041392/pexels-photo-4041392.jpeg?auto=compress&cs=tinysrgb&w=80" 
                      alt="Power tool" 
                      style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
                    />
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>

        {/* Product Categories Section - Below Banner */}
        <Box sx={{ 
          display: 'flex',
          position: 'relative',
          flexDirection: 'column',
          alignItems: 'center', 
          mb: 4, 
          mt: 4,
          py: 2, 
          width: '80%',
          px: 2,
          backgroundColor: '#f9f9f9',
          borderRadius: 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <Typography variant="h6" fontWeight="medium" color="text.secondary" align="center" sx={{ mb: 2 }}>
            Shop by Category
          </Typography>
          <Box sx={{ 
            display: 'flex', 
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: { xs: 1, sm: 2, md: 3 },
            width: '100%'
          }}>
            {/* Women Clothing */}
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  transition: 'all 0.3s',
                }
              }}
              onClick={() => navigate('/category/women-clothing')}
            >
              <Box 
                sx={{ 
                  width: 70, 
                  height: 70, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  mb: 1,
                  overflow: 'hidden',
                  border: '1px solid #eee',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <img 
                  src="https://images.pexels.com/photos/1021693/pexels-photo-1021693.jpeg" 
                  alt="Women Clothing" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Box>
              <Typography variant="body2" align="center" sx={{ fontSize: '0.8rem', fontWeight: 'medium' }}>
                Women Clothing<br />& Fashion
              </Typography>
            </Box>

            {/* Men Clothing */}
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  transition: 'all 0.3s',
                }
              }}
              onClick={() => navigate('/category/men-clothing')}
            >
              <Box 
                sx={{ 
                  width: 70, 
                  height: 70, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  mb: 1,
                  overflow: 'hidden',
                  border: '1px solid #eee',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <img 
                  src="https://images.pexels.com/photos/2254065/pexels-photo-2254065.jpeg" 
                  alt="Men Clothing" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Box>
              <Typography variant="body2" align="center" sx={{ fontSize: '0.8rem', fontWeight: 'medium' }}>
                Men Clothing<br />& Fashion
              </Typography>
            </Box>

            {/* Computers-Cameras */}
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  transition: 'all 0.3s',
                }
              }}
              onClick={() => navigate('/category/electronics')}
            >
              <Box 
                sx={{ 
                  width: 70, 
                  height: 70, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  mb: 1,
                  overflow: 'hidden',
                  border: '1px solid #eee',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <img 
                  src="https://images.pexels.com/photos/777001/pexels-photo-777001.jpeg" 
                  alt="Computers & Cameras" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Box>
              <Typography variant="body2" align="center" sx={{ fontSize: '0.8rem', fontWeight: 'medium' }}>
                Computers-<br />Cameras-<br />Accessories
              </Typography>
            </Box>

            {/* Kids & toy */}
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  transition: 'all 0.3s',
                }
              }}
              onClick={() => navigate('/category/kids-toys')}
            >
              <Box 
                sx={{ 
                  width: 70, 
                  height: 70, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  mb: 1,
                  overflow: 'hidden',
                  border: '1px solid #eee',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <img 
                  src="https://images.pexels.com/photos/981588/pexels-photo-981588.jpeg" 
                  alt="Kids & toy" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Box>
              <Typography variant="body2" align="center" sx={{ fontSize: '0.8rem', fontWeight: 'medium' }}>
                Kids & toy
              </Typography>
            </Box>

            {/* Sports & outdoor */}
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  transition: 'all 0.3s',
                }
              }}
              onClick={() => navigate('/category/sports')}
            >
              <Box 
                sx={{ 
                  width: 70, 
                  height: 70, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  mb: 1,
                  overflow: 'hidden',
                  border: '1px solid #eee',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <img 
                  src="https://images.pexels.com/photos/209977/pexels-photo-209977.jpeg" 
                  alt="Sports & outdoor" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Box>
              <Typography variant="body2" align="center" sx={{ fontSize: '0.8rem', fontWeight: 'medium' }}>
                Sports & outdoor
              </Typography>
            </Box>

            {/* Automobile & Motorcycle */}
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  transition: 'all 0.3s',
                }
              }}
              onClick={() => navigate('/category/automobile')}
            >
              <Box 
                sx={{ 
                  width: 70, 
                  height: 70, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  mb: 1,
                  overflow: 'hidden',
                  border: '1px solid #eee',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <img 
                  src="https://images.pexels.com/photos/3422964/pexels-photo-3422964.jpeg" 
                  alt="Automobile & Motorcycle" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Box>
              <Typography variant="body2" align="center" sx={{ fontSize: '0.8rem', fontWeight: 'medium' }}>
                Automobile &<br />Motorcycle
              </Typography>
            </Box>

            {/* Jewelry & Watches */}
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                cursor: 'pointer',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  transition: 'all 0.3s',
                }
              }}
              onClick={() => navigate('/category/jewelry')}
            >
              <Box 
                sx={{ 
                  width: 70, 
                  height: 70, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  mb: 1,
                  overflow: 'hidden',
                  border: '1px solid #eee',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <img 
                  src="https://images.pexels.com/photos/265906/pexels-photo-265906.jpeg" 
                  alt="Jewelry & Watches" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Box>
              <Typography variant="body2" align="center" sx={{ fontSize: '0.8rem', fontWeight: 'medium' }}>
                Jewelry & Watches
              </Typography>
            </Box>
          </Box>
          
          {/* Todays Deal Banner - Right Side of Shop by Category */}
       
        </Box>

        {/* Search Section - Mobile friendly additional search box */}
        <Box 
          sx={{ 
            mb: 4, 
            display: { xs: 'block', md: 'none' }, // Only show on mobile/small screens
            textAlign: 'center'
          }}
        >
          <Typography variant="h6" gutterBottom>
            Find Your Perfect Product
          </Typography>
          <Paper
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchSubmit();
            }}
            sx={{
              p: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              maxWidth: '600px',
              margin: '0 auto',
              backgroundColor: '#f5f5f5',
              '&:hover': {
                backgroundColor: '#fff',
                boxShadow: 2
              },
              borderRadius: '4px',
              border: '1px solid #e0e0e0',
              transition: 'all 0.3s ease',
            }}
          >
            <SearchIcon sx={{ p: '10px', color: 'primary.main' }} />
            <InputBase
              sx={{ 
                ml: 1, 
                flex: 1,
                '& input': {
                  padding: '10px 0',
                }
              }}
              placeholder="Search products by name..."
              value={localSearchTerm}
              onChange={handleSearchChange}
              onKeyPress={handleSearchKeyPress}
            />
            {localSearchTerm && (
              <IconButton 
                size="small"
                sx={{ p: '5px' }} 
                aria-label="clear search"
                onClick={handleClearSearch}
              >
                <Typography sx={{ fontSize: 18, fontWeight: 'bold' }}>×</Typography>
              </IconButton>
            )}
            <IconButton 
              size="small"
              sx={{ p: '8px' }} 
              aria-label="search"
              onClick={handleSearchSubmit}
            >
              <SearchIcon fontSize="small" />
            </IconButton>
          </Paper>
        </Box>

        {/* Special Offers Section */}
        <Box sx={{ mb: 4 }}>
          <Fade in={true} timeout={500}>
            <Paper
              elevation={3}
              sx={{
                p: 2,
                background: `linear-gradient(45deg, ${specialOffers[currentOfferIndex].color} 30%, ${specialOffers[currentOfferIndex].color}dd 90%)`,
                color: 'white',
                borderRadius: 2,
                transition: 'background 0.5s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}
            >
              <OfferIcon fontSize="large" />
              <Box>
                <Typography variant="h5" component="h2" fontWeight="bold">
                  {specialOffers[currentOfferIndex].title}
                </Typography>
                <Typography variant="subtitle1">
                  {specialOffers[currentOfferIndex].description}
                </Typography>
              </Box>
            </Paper>
          </Fade>
        </Box>

        {/* Today's Deal Section */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
            px: 1,
          }}>
            <Typography variant="h5" component="h2" fontWeight="bold">
              Today's Deal
            </Typography>
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                bgcolor: '#FF4D33',
                color: 'white',
                px: 1,
                py: 0.2,
                borderRadius: 1,
                fontSize: '0.8rem',
                fontWeight: 'bold',
              }}
            >
              Hot
            </Box>
          </Box>
          
          <Box sx={{
            display: 'flex',
            overflow: 'auto',
            gap: 2,
            pb: 1,
            '&::-webkit-scrollbar': {
              height: 6,
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: '#f1f1f1',
              borderRadius: 2,
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: '#888',
              borderRadius: 2,
            },
          }}>
            {/* Deal Product 1 */}
            <Card 
              sx={{ 
                minWidth: { xs: '160px', sm: '200px' }, 
                maxWidth: { xs: '160px', sm: '200px' },
                cursor: 'pointer',
                '&:hover': { 
                  transform: 'translateY(-4px)', 
                  transition: 'transform 0.3s ease',
                  boxShadow: 3,
                }
              }}
              onClick={() => isAuthenticated ? handleProductClick('dealproduct1') : navigate('/customer/login')}
            >
              <Box sx={{ position: 'relative' }}>
                <CardMedia
                  component="img"
                  height="160"
                  image="https://m.media-amazon.com/images/I/71ctRE34RuL._AC_UF894,1000_QL80_.jpg"
                  alt="Premium headphones with case"
                />
              </Box>
              <CardContent sx={{ p: 1 }}>
                <Typography color="primary" fontWeight="bold" variant="body1">
                  $24.00
                </Typography>
                <Typography color="text.secondary" sx={{ textDecoration: 'line-through', fontSize: '0.85rem' }}>
                  $25.00
                </Typography>
              </CardContent>
            </Card>

            {/* Deal Product 2 */}
            <Card 
              sx={{ 
                minWidth: { xs: '160px', sm: '200px' }, 
                maxWidth: { xs: '160px', sm: '200px' },
                cursor: 'pointer',
                '&:hover': { 
                  transform: 'translateY(-4px)', 
                  transition: 'transform 0.3s ease',
                  boxShadow: 3,
                }
              }}
              onClick={() => isAuthenticated ? handleProductClick('dealproduct2') : navigate('/customer/login')}
            >
              <Box sx={{ position: 'relative' }}>
                <CardMedia
                  component="img"
                  height="160"
                  image="https://images.pexels.com/photos/5961984/pexels-photo-5961984.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
                  alt="Gold jewelry collection"
                />
              </Box>
              <CardContent sx={{ p: 1 }}>
                <Typography color="primary" fontWeight="bold" variant="body1">
                  $31.89
                </Typography>
                <Typography color="text.secondary" sx={{ textDecoration: 'line-through', fontSize: '0.85rem' }}>
                  $32.49
                </Typography>
              </CardContent>
            </Card>

            {/* Deal Product 3 */}
            <Card 
              sx={{ 
                minWidth: { xs: '160px', sm: '200px' }, 
                maxWidth: { xs: '160px', sm: '200px' },
                cursor: 'pointer',
                '&:hover': { 
                  transform: 'translateY(-4px)', 
                  transition: 'transform 0.3s ease',
                  boxShadow: 3,
                }
              }}
              onClick={() => isAuthenticated ? handleProductClick('dealproduct3') : navigate('/customer/login')}
            >
              <Box sx={{ position: 'relative' }}>
                <CardMedia
                  component="img"
                  height="160"
                  image="https://images.pexels.com/photos/4041392/pexels-photo-4041392.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
                  alt="Skincare products"
                />
              </Box>
              <CardContent sx={{ p: 1 }}>
                <Typography color="primary" fontWeight="bold" variant="body1">
                  $19.95
                </Typography>
                <Typography color="text.secondary" sx={{ textDecoration: 'line-through', fontSize: '0.85rem' }}>
                  $24.99
                </Typography>
              </CardContent>
            </Card>

            {/* Deal Product 4 */}
            <Card 
              sx={{ 
                minWidth: { xs: '160px', sm: '200px' }, 
                maxWidth: { xs: '160px', sm: '200px' },
                cursor: 'pointer',
                '&:hover': { 
                  transform: 'translateY(-4px)', 
                  transition: 'transform 0.3s ease',
                  boxShadow: 3,
                }
              }}
              onClick={() => isAuthenticated ? handleProductClick('dealproduct4') : navigate('/customer/login')}
            >
              <Box sx={{ position: 'relative' }}>
                <CardMedia
                  component="img"
                  height="160"
                  image="https://images.pexels.com/photos/356056/pexels-photo-356056.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
                  alt="Smart watch"
                />
              </Box>
              <CardContent sx={{ p: 1 }}>
                <Typography color="primary" fontWeight="bold" variant="body1">
                  $49.99
                </Typography>
                <Typography color="text.secondary" sx={{ textDecoration: 'line-through', fontSize: '0.85rem' }}>
                  $59.99
                </Typography>
              </CardContent>
            </Card>

            {/* Deal Product 5 */}
            <Card 
              sx={{ 
                minWidth: { xs: '160px', sm: '200px' }, 
                maxWidth: { xs: '160px', sm: '200px' },
                cursor: 'pointer',
                '&:hover': { 
                  transform: 'translateY(-4px)', 
                  transition: 'transform 0.3s ease',
                  boxShadow: 3,
                }
              }}
              onClick={() => isAuthenticated ? handleProductClick('dealproduct5') : navigate('/customer/login')}
            >
              <Box sx={{ position: 'relative' }}>
                <CardMedia
                  component="img"
                  height="160"
                  image="https://images.pexels.com/photos/341523/pexels-photo-341523.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
                  alt="Professional camera"
                />
              </Box>
              <CardContent sx={{ p: 1 }}>
                <Typography color="primary" fontWeight="bold" variant="body1">
                  $399.00
                </Typography>
                <Typography color="text.secondary" sx={{ textDecoration: 'line-through', fontSize: '0.85rem' }}>
                  $449.00
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>

        {!isAuthenticated && (
          <Box sx={{ mb: 4, p: 2, bgcolor: 'white', borderRadius: 1 }}>
            {/* <Typography align="center" color="white">
              Login to enjoy personalized recommendations and add products to your cart
            </Typography> */}
          </Box>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
            <CircularProgress />
          </Box>
        ) : error ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
            <Typography color="error">{error}</Typography>
          </Box>
        ) : !isAuthenticated && !localSearchTerm ? (
          <>
            {/* New Products Section */}
            <Box sx={{ mb: 5 }}>
              <Typography variant="h5" component="h2" color="error" fontWeight="bold" sx={{ mb: 2, borderBottom: '1px solid #eaeaea', pb: 1 }}>
                New Products
              </Typography>
              
              <Box sx={{ position: 'relative' }}>
                <IconButton 
                  size="small" 
                  sx={{ 
                    position: 'absolute',
                    left: -15,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#555', 
                    bgcolor: '#fff', 
                    boxShadow: '0 0 5px rgba(0,0,0,0.2)', 
                    borderRadius: '50%',
                    width: 30, 
                    height: 30,
                    zIndex: 1
                  }}
                >
                  <Typography sx={{ fontSize: 16 }}>&lt;</Typography>
                </IconButton>
                
                <Grid container spacing={2}>
                {/* Product 1 - Baby Shorts */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/qoGrgDeMa8fqXQynGxTuMbi8Fjyb4AvWjhpvpuFd.jpg"
                      alt="Gerber Baby 3-Pack Knit Shorts"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                        $22.23/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                        Gerber Baby 3-Pack Knit Shorts
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Product 2 - Keyboard */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/lQc6AVC4vqUDwCd7W3MwJYMoo5Bv7u7CBV5RdmSc.jpg"
                      alt="Keyboard"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                        $22.35/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                        Easter Basket Stuffers - Toddlers Montessori Toys
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Product 3 - Electric Bottle Brush */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/GmGFPFPXiwNAn81B5lqEzm81eBOg3PTaIbzXYekD.jpg"
                      alt="MomMed Electric Bottle Brush"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                        $35.00/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                        <Box component="span" color="#e0e0e0" sx={{ fontSize: '14px' }}>★</Box>
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                        MomMed Electric Bottle Brush, Electric Baby Bottle Cleaner
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Product 4 - Paper Bowls */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/w4tlbY1RsbTC2ZGYV6SesPyoHKSUKBfQSWpQeVpa.jpg"
                      alt="Homestockplus 24 Oz Disposable Paper Bowls"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                        $21.25/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                        <Box component="span" color="#BBB" sx={{ fontSize: '14px' }}>★</Box>
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                        Homestockplus [50 Pack] 24 Oz Disposable Paper Bowls
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Product 5 - Scissors */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/kDIAizwgimyHo4aHRUkHgfM77YS8HXKrdfPXgxcf.jpg"
                      alt="JD.GLOBAL Basics Multipurpose Scissors"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                        $12.50/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                        JD.GLOBAL Basics Multipurpose, Comfort Grip Scissors
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                </Grid>
                
                <IconButton 
                  size="small" 
                  sx={{ 
                    position: 'absolute',
                    right: -15,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#555', 
                    bgcolor: '#fff', 
                    boxShadow: '0 0 5px rgba(0,0,0,0.2)', 
                    borderRadius: '50%',
                    width: 30, 
                    height: 30,
                    zIndex: 1
                  }}
                >
                  <Typography sx={{ fontSize: 16 }}>&gt;</Typography>
                </IconButton>
              </Box>
            </Box>

          {/* Featured Products Section */}
          <Box sx={{ mb: 5 }}>
              <Typography variant="h5" component="h2" color="error" fontWeight="bold" sx={{ mb: 2, borderBottom: '1px solid #eaeaea', pb: 1 }}>
              Featured Products
              </Typography>
              
              <Box sx={{ position: 'relative' }}>
                <IconButton 
                  size="small" 
                  sx={{ 
                    position: 'absolute',
                    left: -15,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#555', 
                    bgcolor: '#fff', 
                    boxShadow: '0 0 5px rgba(0,0,0,0.2)', 
                    borderRadius: '50%',
                    width: 30, 
                    height: 30,
                    zIndex: 1
                  }}
                >
                  <Typography sx={{ fontSize: 16 }}>&lt;</Typography>
                </IconButton>
                
                <Grid container spacing={2}>
                {/* Product 1 - Baby Shorts */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/IIMMgPyUmx7huS3206zEuu3UVpStrTQmM3D9mMgh.jpg"
                      alt="Gerber Baby 3-Pack Knit Shorts"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                      $11.09/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                      Cute Cartoon Sanrio Kulomi Novelty Slippers, Hellokitty & Melody Kawaii Non-slip Soft Fuzzy Home Slippers, Plush Cozy Shoes
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Product 2 - Keyboard */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/KqvMtk0RUVVVSkXqKSXjuTXn1u9oUHIi9v1ksbxU.jpg"
                      alt="Keyboard"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                      $1,524.99/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                      Samsung - Galaxy S24 Ultra 512GB (Unlocked)
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Product 3 - Electric Bottle Brush */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/DNgJnYIKP4KQvgKtX5cyIfH35aUnrDkg5CnD2oNs.jpg"
                      alt="MomMed Electric Bottle Brush"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                      $3,123.75/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                        <Box component="span" color="#e0e0e0" sx={{ fontSize: '14px' }}>★</Box>
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                      Apple iPhone 15 Plus, 256GB - Unlocked
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Product 4 - Paper Bowls */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/0QNTpDzsYPl4iv2ht5ALmS6gAScRZJePVPmWTE9M.jpg"
                      alt="Homestockplus 24 Oz Disposable Paper Bowls"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                      $1,123.75/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                        <Box component="span" color="#BBB" sx={{ fontSize: '14px' }}>★</Box>
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                      Apple iPhone 15 Plus, 256GB - Unlocked
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Product 5 - Scissors */}
                <Grid item xs={6} sm={6} md={2.4}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: 'none', border: '1px solid #eaeaea' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image="https://esellerstorevip.biz/public/uploads/all/qMAhT0DkDiDXGOCtpIkJyNAOxX5DWTEC8mXAyeGP.png"
                      alt="JD.GLOBAL Basics Multipurpose Scissors"
                    />
                    <CardContent sx={{ p: 1, pt: 1.5 }}>
                      <Typography color="error" fontWeight="bold" variant="body1">
                      $30.59/Pc
                      </Typography>
                      <Box sx={{ display: 'flex', my: 0.5 }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Box key={star} component="span" color="#FFB900" sx={{ fontSize: '14px' }}>★</Box>
                        ))}
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', height: '40px', overflow: 'hidden' }}>
                      Ladies Open Toe Stiletto Bow Knot Lace-Up Ankle Straps Sandals High Heels
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                </Grid>
                
                <IconButton 
                  size="small" 
                  sx={{ 
                    position: 'absolute',
                    right: -15,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#555', 
                    bgcolor: '#fff', 
                    boxShadow: '0 0 5px rgba(0,0,0,0.2)', 
                    borderRadius: '50%',
                    width: 30, 
                    height: 30,
                    zIndex: 1
                  }}
                >
                  <Typography sx={{ fontSize: 16 }}>&gt;</Typography>
                </IconButton>
              </Box>
            </Box>


            {/* Category Tabs for Non-Authenticated Users */}
            <Box sx={{ mb: 4 }}>
              <Tabs 
                value={activeCategory} 
                onChange={handleCategoryChange}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontSize: { xs: '0.8rem', sm: '1rem' },
                    minWidth: { xs: 'auto', sm: 120 },
                  }
                }}
              >
                {sampleProductsData.map((category, index) => (
                  <Tab 
                    key={category.id} 
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {category.icon}
                        <span>{category.name}</span>
                      </Box>
                    } 
                    id={`tab-${index}`}
                    aria-controls={`tabpanel-${index}`}
                  />
                ))}
              </Tabs>
            </Box>
            
            {/* Render Category Products */}
            {sampleProductsData.length > 0 ? (
              <>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium', ml: 1 }}>
                    {sampleProductsData[activeCategory].name}
                  </Typography>
                </Box>
                <Grid container spacing={3}>
                  {currentCategoryProducts.filter(product => !product.hidden).map((product) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={product.uniqueKey}>
                      <Card 
                        sx={{ 
                          height: '100%', 
                          display: 'flex', 
                          flexDirection: 'column',
                          cursor: 'pointer',
                          position: 'relative',
                          overflow: 'visible',
                          transition: 'all 0.3s ease-in-out',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: 3
                          }
                        }}
                        onClick={() => navigate('/customer/login')}
                        onMouseEnter={() => setHoveredCard(product.id)}
                        onMouseLeave={() => setHoveredCard(null)}
                      >
                        {product.isFeatured && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: -10,
                              right: -10,
                              bgcolor: 'error.main',
                              color: 'white',
                              borderRadius: '50%',
                              width: 40,
                              height: 40,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold',
                              fontSize: '0.8rem',
                              zIndex: 1,
                              boxShadow: 2
                            }}
                          >
                            HOT
                          </Box>
                        )}
                        {product.discountPercent > 0 && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: 10,
                              left: 0,
                              bgcolor: 'success.main',
                              color: 'white',
                              py: 0.5,
                              px: 1,
                              fontWeight: 'bold',
                              fontSize: '0.8rem',
                              zIndex: 1,
                              boxShadow: 1
                            }}
                          >
                            {product.discountPercent}% OFF
                          </Box>
                        )}
                        <CardMedia
                          component="img"
                          height="250"
                          image={product.imageUrl}
                          alt={product.name}
                          sx={{ 
                            objectFit: 'cover',
                            width: '100%',
                            height: 250,
                            backgroundColor: '#f5f5f5',
                            aspectRatio: '1/1',
                            objectPosition: 'center',
                            display: 'block',
                            position: 'relative',
                            '& img': {
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              objectPosition: 'center'
                            }
                          }}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = product.fallbackImage || DEFAULT_FALLBACK_IMAGE;
                          }}
                        />
                        <CardContent sx={{ flexGrow: 1 }}>
                          <Typography gutterBottom variant="h6" component="h2" noWrap>
                            {product.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, height: '40px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {product.description}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="h6" color="primary" fontWeight="bold">
                              ${product.discountPercent > 0 
                                ? (product.price * (1 - product.discountPercent/100)).toFixed(2)
                                : product.price}
                            </Typography>
                            {product.discountPercent > 0 && (
                              <Typography variant="body2" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                                ${product.price}
                              </Typography>
                            )}
                          </Box>
                        </CardContent>
                        <Fade in={hoveredCard === product.id}>
                          <CardActions 
                            sx={{ 
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              bgcolor: 'rgba(0, 0, 0, 0.7)',
                              justifyContent: 'center',
                              p: 1
                            }}
                          >
                            <Button
                              variant="contained"
                              color="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate('/customer/login');
                              }}
                              sx={{ color: 'white' }}
                            >
                              Login to View
                            </Button>
                          </CardActions>
                        </Fade>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4, mb: 4 }}>
                <Typography variant="h6" gutterBottom>
                  No products are available for display at this time.
                </Typography>
                <Typography variant="body1">
                  Please check back later for new products.
                </Typography>
              </Box>
            )}
          </>
        ) : displayProductsWithKeys.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" gutterBottom>
              No products found matching your search criteria
            </Typography>
            {localSearchTerm && (
              <Button 
                variant="outlined" 
                color="primary" 
                onClick={() => {
                  navigate('/', { replace: true });
                }}
                sx={{ mt: 2 }}
              >
                Clear Search
              </Button>
            )}
          </Box>
        ) : (
          <Grid container spacing={3}>
            {displayProductsWithKeys.filter(product => !product.hidden).map((product) => {
              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={product.uniqueKey}>
                  <Card 
                    sx={{ 
                      height: '100%', 
                      display: 'flex', 
                      flexDirection: 'column',
                      cursor: 'pointer',
                      position: 'relative',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 3,
                        transition: 'all 0.3s ease-in-out'
                      }
                    }}
                    onClick={() => handleProductClick(product.id)}
                    onMouseEnter={() => setHoveredCard(product.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <CardMedia
                      component="img"
                      height="250"
                      image={product.imageUrl || DEFAULT_FALLBACK_IMAGE}
                      alt={product.name}
                      sx={{ 
                        objectFit: 'cover',
                        width: '100%',
                        height: 250,
                        backgroundColor: '#f5f5f5',
                        aspectRatio: '1/1',
                        objectPosition: 'center',
                        display: 'block',
                        position: 'relative',
                        '& img': {
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'center'
                        }
                      }}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = DEFAULT_FALLBACK_IMAGE;
                      }}
                    />
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Typography gutterBottom variant="h6" component="h2" noWrap>
                        {product.name}
                      </Typography>
                      {/* <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {product.seller?.shopName || 'Unknown Shop'}
                      </Typography> */}
                      <Typography variant="h6" color="primary">
                        ${product.price}
                      </Typography>
                    </CardContent>
                    <Fade in={hoveredCard === product.id}>
                      <CardActions 
                        sx={{ 
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          bgcolor: 'rgba(0, 0, 0, 0.7)',
                          justifyContent: 'space-between',
                          p: 1
                        }}
                      >
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<InfoIcon />}
                          onClick={(e) => handleDetailsClick(e, product.id)}
                          sx={{ color: 'white' }}
                        >
                          Details
                        </Button>
                        {isAuthenticated ? (
                          <Button
                            variant="contained"
                            color="secondary"
                            startIcon={<AddCartIcon />}
                            onClick={(e) => handleAddToCart(e, product)}
                            sx={{ color: 'white' }}
                          >
                            Add to Cart
                          </Button>
                        ) : (
                          <Button
                            variant="contained"
                            color="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              alert('Please login to add products to cart');
                              navigate('/customer/login');
                            }}
                            sx={{ color: 'white' }}
                          >
                            Login to Buy
                          </Button>
                        )}
                      </CardActions>
                    </Fade>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Container>
      <Footer />
    </>
  );
};

export default HomePage; 
