const PaymentService = require("../services/PaymentService");
const vnpayConfig = require("../config/vnpay");
const crypto = require("crypto");
const moment = require("moment");
const querystring = require("qs");

// Helper function to sort object by key (for VNPay)
function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    if (obj.hasOwnProperty(key)) {
      sorted[key] = obj[key];
    }
  }
  return sorted;
}

//create Payment
const createPayment = async (req, res) => {
  try {
    const { amount, orderInfo, bankCode, language, orderId } = req.body;

    if (!amount || !orderId) {
      return res.status(200).json({
        status: "ERR",
        message: "Amount and orderId are required",
      });
    }

    // Validate that the orderId exists
    try {
      const Order = require('../models/OrderModel');
      const orderExists = await Order.findById(orderId);
      if (!orderExists) {
        return res.status(200).json({
          status: "ERR",
          message: "Order not found",
        });
      }
    } catch (error) {
      return res.status(200).json({
        status: "ERR",
        message: "Invalid orderId format or order not found",
      });
    }

    // Get IP address
    let ipAddr = req.headers['x-forwarded-for'] ||
                req.connection.remoteAddress ||
                req.socket.remoteAddress ||
                req.connection.socket.remoteAddress;

    // If IP is IPv6 localhost, convert to IPv4 format
    if (ipAddr === '::1' || ipAddr.includes('::ffff:')) {
      ipAddr = '127.0.0.1';
    }

    const paymentData = {
      amount,
      orderInfo: orderInfo || `Thanh toan don hang ${orderId}`,
      bankCode: bankCode || '',
      language: language || 'vn',
      orderId,
      ipAddr
    };

    // Console log for debugging
    console.log("Creating VNPay payment with data:", paymentData);

    const response = await PaymentService.createPaymentUrl(paymentData);

    // Console log for debugging
    console.log("VNPay payment URL created:", response);

    return res.status(200).json(response);
  } catch (e) {
    console.error("Error creating VNPay payment:", e);
    return res.status(404).json({
      status: "ERR",
      message: e.message || "An error occurred while creating VNPay payment",
    });
  }
};

// Process VNPay return
const paymentReturn = async (req, res) => {
  try {
    const vnpParams = req.query;
    const response = await PaymentService.processPaymentReturn(vnpParams);

    // For direct browser returns, redirect to frontend with params
    if (req.headers.accept?.includes('text/html')) {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const queryParams = new URLSearchParams({
        vnp_ResponseCode: response.code,
        vnp_TxnRef: vnpParams.vnp_TxnRef || '',
        message: response.message
      }).toString();

      return res.redirect(`${baseUrl}/payment/result?${queryParams}`);
    }

    // For API calls, return JSON
    return res.status(200).json(response);
  } catch (e) {
    console.error("Error processing VNPay return:", e);
    return res.status(404).json({
      status: "ERR",
      message: e.message || "An error occurred while processing payment return",
    });
  }
};

// Process IPN callback from VNPay
const paymentIpn = async (req, res) => {
  try {
    const vnpParams = req.query;
    const response = await PaymentService.processPaymentReturn(vnpParams);

    // Always return standard format for VNPay IPN
    if (response.status === "OK") {
      return res.status(200).json({
        RspCode: "00",
        Message: "Confirm Success"
      });
    } else {
      return res.status(200).json({
        RspCode: response.code || "99",
        Message: response.message || "Confirm Fail"
      });
    }
  } catch (e) {
    console.error("Error processing payment IPN:", e);
    return res.status(200).json({
      RspCode: "99",
      Message: "Unknown error"
    });
  }
};

// Get payment by order ID
const getPaymentByOrderId = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    if (!orderId) {
      return res.status(200).json({
        status: "ERR",
        message: "Order ID is required",
      });
    }

    const response = await PaymentService.getPaymentByOrderId(orderId);
    return res.status(200).json(response);
  } catch (e) {
    console.error("Error getting payment details:", e);
    return res.status(404).json({
      status: "ERR",
      message: e.message || "An error occurred while getting payment details",
    });
  }
};

// Get all payments (admin)
const getAllPayments = async (req, res) => {
  try {
    const { limit, page, sort, filter } = req.query;
    const response = await PaymentService.getAllPayments(
      Number(limit) || 8,
      Number(page) || 0,
      sort,
      filter
    );
    return res.status(200).json(response);
  } catch (e) {
    console.error("Error getting all payments:", e);
    return res.status(404).json({
      status: "ERR",
      message: e.message || "An error occurred while getting payments",
    });
  }
};

// Process COD payment
const processCodPayment = async (req, res) => {
  try {
    const { orderId, amount, paymentMethod } = req.body;

    if (!orderId || !amount) {
      return res.status(200).json({
        status: "ERR",
        message: "orderId and amount are required",
      });
    }

    // Validate that the orderId exists
    try {
      const Order = require('../models/OrderModel');
      const orderExists = await Order.findById(orderId);
      if (!orderExists) {
        return res.status(200).json({
          status: "ERR",
          message: "Order not found",
        });
      }

      // Create a COD payment record
      const response = await PaymentService.createCodPayment({
        orderId,
        amount,
        paymentMethod: paymentMethod || "COD"
      });

      return res.status(200).json(response);
    } catch (error) {
      return res.status(200).json({
        status: "ERR",
        message: "Invalid orderId format or order not found",
      });
    }
  } catch (e) {
    console.error("Error processing COD payment:", e);
    return res.status(404).json({
      status: "ERR",
      message: e.message || "An error occurred while processing COD payment",
    });
  }
};

module.exports = {
  createPayment,
  paymentReturn,
  paymentIpn,
  getPaymentByOrderId,
  getAllPayments,
  processCodPayment
};
