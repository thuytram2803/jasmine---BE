const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/PaymentController");
const { authMiddleware } = require("../middleware/authMiddleware");

// Create VNPay payment
router.post("/create", paymentController.createPayment);

// Process COD payment
router.post("/process-cod", paymentController.processCodPayment);

// VNPay return and IPN
router.get("/vnpay-return", paymentController.paymentReturn);
router.get("/ipn", paymentController.paymentIpn);

// Get payment by order ID
router.get("/order/:orderId", paymentController.getPaymentByOrderId);

// Get all payments (admin only)
router.get("/all", authMiddleware, paymentController.getAllPayments);

module.exports = router;
