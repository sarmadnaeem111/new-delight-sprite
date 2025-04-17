import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Box, 
  Grid, 
  Paper, 
  TableContainer, 
  Table, 
  TableHead, 
  TableRow, 
  TableCell, 
  TableBody, 
  Button, 
  Chip,
  CircularProgress,
  Container,
  IconButton,
  Breadcrumbs,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  Divider,
  Stack
} from '@mui/material';
import { 
  ArrowBack as ArrowBackIcon,
  ShoppingCartCheckout as ShoppingCartCheckoutIcon 
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp } from 'firebase/firestore';

const SellerOrderDetailsPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true);
        const orderRef = doc(db, "orders", orderId);
        const orderDoc = await getDoc(orderRef);

        if (!orderDoc.exists()) {
          setError("Order not found");
          return;
        }

        setOrder({ id: orderDoc.id, ...orderDoc.data() });
      } catch (err) {
        console.error("Error fetching order details:", err);
        setError("Failed to load order details");
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp instanceof Date 
        ? timestamp 
        : new Date(timestamp);
      return date.toLocaleString();
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Invalid date';
    }
  };

  const handlePickOrder = async () => {
    try {
      setLoading(true);
      
      // Get seller ID from localStorage
      const sellerId = localStorage.getItem('sellerId');
      
      if (!sellerId) {
        throw new Error("Seller ID not found in localStorage");
      }

      // Get the order details
      const orderRef = doc(db, "orders", orderId);
      const orderDoc = await getDoc(orderRef);

      if (!orderDoc.exists()) {
        throw new Error("Order not found");
      }

      const orderData = orderDoc.data();

      // Calculate total product price and profit from order items
      let totalProductPrice = 0;
      let totalAdditionalProfit = 0;

      if (orderData.items && Array.isArray(orderData.items)) {
        orderData.items.forEach((item) => {
          const itemPrice = Number(item.price || 0);
          const itemQuantity = Number(item.quantity || 1);

          totalProductPrice += itemPrice * itemQuantity;
          totalAdditionalProfit += itemPrice * 0.23 * itemQuantity;
        });
      }

      // Get seller's current data
      const sellerRef = doc(db, "sellers", sellerId);
      const sellerDoc = await getDoc(sellerRef);

      if (!sellerDoc.exists()) {
        throw new Error("Seller data not found");
      }

      const sellerData = sellerDoc.data();
      const currentWalletBalance = Number(sellerData.walletBalance) || 0;
      const currentPendingAmount = Number(sellerData.pendingAmount) || 0;

      // Check if seller has enough balance
      if (currentWalletBalance < totalProductPrice) {
        alert("Insufficient wallet balance to pick this order");
        return;
      }

      // Update the order status to "picked"
      await updateDoc(orderRef, {
        status: "picked",
        pickedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: "picked",
          timestamp: new Date().toISOString(),
          updatedBy: "seller",
        }),
      });

      // Update seller's wallet balance and pending amount
      await updateDoc(sellerRef, {
        walletBalance: currentWalletBalance - totalProductPrice,
        pendingAmount: currentPendingAmount + totalProductPrice + totalAdditionalProfit,
        lastUpdated: serverTimestamp(),
      });

      // Add transaction record
      await addDoc(collection(db, "transactions"), {
        orderId: orderId,
        sellerId: sellerId,
        amount: -totalProductPrice,
        type: "order_picked",
        affectsRevenue: true,
        timestamp: serverTimestamp(),
        note: `Funds reserved for order #${orderData.orderNumber || orderId.substring(0, 8)}`,
      });

      // Update local state
      setOrder(prevOrder => ({
        ...prevOrder,
        status: "picked",
        pickedAt: new Date(),
      }));

      alert("Order picked successfully. Processing will begin shortly!");
      
    } catch (error) {
      console.error("Error picking order:", error);
      alert("Failed to pick order: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (newStatus) => {
    try {
      setLoading(true);

      // Get seller ID from localStorage
      const sellerId = localStorage.getItem('sellerId');
      const sellerEmail = localStorage.getItem('sellerEmail');
      const sellerName = localStorage.getItem('sellerName') || sellerEmail;
      
      if (!sellerId) {
        throw new Error("Seller ID not found in localStorage");
      }

      // Get the order details
      const orderRef = doc(db, "orders", orderId);
      const orderDoc = await getDoc(orderRef);

      if (!orderDoc.exists()) {
        throw new Error("Order not found");
      }

      const orderData = orderDoc.data();

      // If the status is being changed to 'completed', add a special note for admin verification
      const isCompletionRequest = newStatus === "completed";

      const updatedStatus = isCompletionRequest
        ? "completion_requested"
        : newStatus;

      // Update the order with the new status
      await updateDoc(orderRef, {
        status: updatedStatus,
        statusHistory: arrayUnion({
          status: updatedStatus,
          timestamp: new Date().toISOString(),
          updatedBy: "seller",
          note: isCompletionRequest
            ? "Seller requested order completion - awaiting admin verification"
            : undefined,
        }),
        completionRequestedAt: isCompletionRequest
          ? serverTimestamp()
          : orderData.completionRequestedAt,
      });

      // If this is a completion request, also notify admin
      if (isCompletionRequest) {
        // Create a notification for the admin
        await addDoc(collection(db, "notifications"), {
          type: "completion_request",
          orderId: orderId,
          sellerId: sellerId,
          createdAt: serverTimestamp(),
          read: false,
          message: `Seller ${sellerName || sellerEmail} has requested completion approval for order #${orderData.orderNumber || orderId.substring(0, 8)}.`,
          priority: "high",
        });
      }

      // Update local state
      setOrder(prevOrder => ({
        ...prevOrder,
        status: updatedStatus,
        completionRequestedAt: isCompletionRequest ? new Date() : prevOrder.completionRequestedAt,
      }));

      alert(isCompletionRequest
        ? "Order completion requested. Admin will review and approve to transfer funds to your wallet."
        : `Order status updated to ${newStatus}`);

    } catch (error) {
      console.error("Error updating order status:", error);
      alert("Failed to update order status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error">{error}</Typography>
        <Button 
          variant="contained" 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/seller/dashboard')}
          sx={{ mt: 2 }}
        >
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  if (!order) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Order not found</Typography>
        <Button 
          variant="contained" 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/seller/dashboard')}
          sx={{ mt: 2 }}
        >
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  // Mobile order items display component
  const MobileOrderItems = () => (
    <Stack spacing={2} sx={{ mt: 2 }}>
      {order.items?.map((item, index) => (
        <Card key={`${order.id}-${index}-${item.id || item.name}`} variant="outlined">
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              {item.imageUrl && (
                <Box 
                  component="img"
                  src={item.imageUrl}
                  alt={item.name}
                  sx={{
                    width: 40,
                    height: 40,
                    objectFit: 'cover',
                    borderRadius: 1
                  }}
                />
              )}
              <Typography variant="subtitle2">{item.name}</Typography>
            </Box>
            <Grid container spacing={1}>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Price</Typography>
                <Typography variant="body2">${Number(item.price || 0).toFixed(2)}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Quantity</Typography>
                <Typography variant="body2">{item.quantity}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Subtotal</Typography>
                <Typography variant="body2">${(Number(item.price || 0) * (item.quantity || 1)).toFixed(2)}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      ))}
      
      <Card variant="outlined">
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2">Subtotal:</Typography>
            <Typography variant="body2">${Number(order.subtotal || 0).toFixed(2)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2">Shipping:</Typography>
            <Typography variant="body2">${Number(order.shipping || 0).toFixed(2)}</Typography>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" color="primary">Total:</Typography>
            <Typography variant="subtitle2" color="primary">
              ${Number(order.total || order.totalAmount || 0).toFixed(2)}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );

  return (
    <Container 
      maxWidth="lg" 
      sx={{ 
        py: { xs: 2, sm: 3, md: 4 },
        px: { xs: 1, sm: 3 }
      }}
    >
      {/* Breadcrumbs - Hide on mobile */}
      {!isMobile && (
        <Box sx={{ mb: 4 }}>
          <Breadcrumbs separator="›" aria-label="breadcrumb">
            <Button 
              color="inherit" 
              onClick={() => navigate('/seller/dashboard')}
              startIcon={<ArrowBackIcon />}
            >
              Dashboard
            </Button>
            <Button 
              color="inherit" 
              onClick={() => navigate('/seller/dashboard?tab=orders')}
            >
              Orders
            </Button>
            <Typography color="text.primary">Order Details</Typography>
          </Breadcrumbs>
        </Box>
      )}

      {/* Mobile back button */}
      {isMobile && (
        <Box sx={{ mb: 2 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/seller/dashboard?tab=orders')}
            size="small"
          >
            Back to Orders
          </Button>
        </Box>
      )}

      {/* Header section */}
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'flex-start' : 'center', 
          mb: 3 
        }}
      >
        <Typography 
          variant={isMobile ? "h5" : "h4"} 
          sx={{ mb: isMobile ? 1 : 0 }}
        >
          Order #{order.orderNumber || order.id.substring(0, 8)}
        </Typography>
        
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            width: isMobile ? '100%' : 'auto',
            justifyContent: isMobile ? 'space-between' : 'flex-end'
          }}
        >
          {order.status === "assigned" && (
            <Button
              variant="contained"
              color="primary"
              onClick={handlePickOrder}
              startIcon={isMobile ? null : <ShoppingCartCheckoutIcon />}
              disabled={loading}
              size={isMobile ? "small" : "medium"}
              sx={{ flexGrow: isMobile ? 1 : 0 }}
            >
              {isMobile ? "Pick" : "Pick Order"}
            </Button>
          )}
          <Chip
            label={order.status}
            color={
              order.status === "completed" ? "success" :
              order.status === "processing" ? "info" :
              order.status === "assigned" ? "primary" :
              order.status === "cancelled" ? "error" : "default"
            }
            size={isMobile ? "small" : "medium"}
          />
        </Box>
      </Box>

      {/* Main content */}
      <Grid container spacing={isMobile ? 2 : 3}>
        {/* Customer Information */}
        {/* <Grid item xs={12} md={6}>
          <Paper elevation={1} sx={{ p: { xs: 2, md: 3 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom color="primary">
              Customer Information
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">Name:</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>{order.customerName || 'N/A'}</Typography>
              <Typography variant="body2" color="text.secondary">Email:</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>{order.customerEmail || 'N/A'}</Typography>
              <Typography variant="body2" color="text.secondary">Phone:</Typography>
              <Typography variant="body1">{order.customerPhone || 'N/A'}</Typography>
            </Box>
          </Paper>
        </Grid> */}

        {/* Order Information */}
        <Grid item xs={12} md={6}>
          <Paper elevation={1} sx={{ p: { xs: 2, md: 3 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom color="primary">
              Order Information
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">Order Date:</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>{formatDate(order.createdAt)}</Typography>
              {/* <Typography variant="body2" color="text.secondary">Payment Method:</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>{order.paymentMethod || 'N/A'}</Typography> */}
              <Typography variant="body2" color="text.secondary">Assignment:</Typography>
              <Typography variant="body1">
                {order.assignedByAdmin ? 'Assigned by Admin' : 'Direct Order'}
              </Typography>
              
              {order.status === "assigned" && isMobile && (
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    onClick={handlePickOrder}
                    startIcon={<ShoppingCartCheckoutIcon />}
                    disabled={loading}
                    size="small"
                  >
                    PICK ORDER
                  </Button>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Order Items - Desktop */}
        <Grid item xs={12}>
          <Paper elevation={1} sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom color="primary">
              Order Items
            </Typography>
            
            {isMobile ? (
              <MobileOrderItems />
            ) : (
              <TableContainer sx={{ maxHeight: { xs: 300, sm: 500 } }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Price</TableCell>
                      <TableCell align="center">Quantity</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.items?.map((item, index) => (
                      <TableRow key={`${order.id}-${index}-${item.id || item.name}`}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                style={{
                                  width: 40,
                                  height: 40,
                                  objectFit: 'cover',
                                  borderRadius: 4
                                }}
                              />
                            )}
                            <Typography variant="body2">{item.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          ${Number(item.price || 0).toFixed(2)}
                        </TableCell>
                        <TableCell align="center">
                          {item.quantity}
                        </TableCell>
                        <TableCell align="right">
                          ${(Number(item.price || 0) * (item.quantity || 1)).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} align="right">
                        <Typography variant="body2">Subtotal:</Typography>
                      </TableCell>
                      <TableCell align="right">
                        ${Number(order.subtotal || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} align="right">
                        <Typography variant="body2">Shipping:</Typography>
                      </TableCell>
                      <TableCell align="right">
                        ${Number(order.shipping || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} align="right">
                        <Typography variant="subtitle2" color="primary">Total:</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="subtitle2" color="primary">
                          ${Number(order.total || order.totalAmount || 0).toFixed(2)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Action buttons */}
      <Box 
        sx={{ 
          mt: { xs: 2, sm: 3, md: 4 }, 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          gap: 2,
          justifyContent: 'space-between' 
        }}
      >
        {!isMobile && (
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/seller/dashboard?tab=orders')}
          >
            Back to Orders
          </Button>
        )}
        
        <Box 
          sx={{ 
            display: 'flex', 
            gap: 2,
            width: isMobile ? '100%' : 'auto',
            flexDirection: isMobile ? 'column' : 'row'
          }}
        >
          {order.status === "assigned" && !isMobile && (
            <Button
              variant="contained"
              color="primary"
              onClick={handlePickOrder}
              disabled={loading}
            >
              Pick Order
            </Button>
          )}
          
          {order.status === "picked" && (
            <Button
              variant="contained"
              color="info"
              onClick={() => handleUpdateOrderStatus("processing")}
              disabled={loading}
              fullWidth={isMobile}
              size={isMobile ? "small" : "medium"}
            >
              Mark as Processing
            </Button>
          )}
          
          {order.status === "processing" && (
            <Button
              variant="contained"
              color="success"
              onClick={() => handleUpdateOrderStatus("completed")}
              disabled={loading}
              fullWidth={isMobile}
              size={isMobile ? "small" : "medium"}
            >
              Request Completion
            </Button>
          )}
        </Box>
      </Box>
    </Container>
  );
};

export default SellerOrderDetailsPage; 