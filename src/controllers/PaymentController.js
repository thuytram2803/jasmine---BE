const PaymentService = require("../services/PaymentService");

//create Payment
const createPayment = async (req, res) => {
  try {
    //test input data
    const {
      paymentCode,
      paymentName,
      paymentMethod,
      userBank,
      userBankNumber,
      // adminBank,
      // adminBankNumber,
      // adminBankImage,
      orderId,
    } = req.body;
    //console.log("req.body", req.body);

    if (!userBank || !userBankNumber || !orderId) {
      //check have
      return res.status(200).json({
        status: "ERR",
        message: "The input is required",
      });
    }

    const response = await PaymentService.createPayment(req.body);
    return res.status(200).json(response);
  } catch (e) {
    return res.status(404).json({
      message: e,
    });
  }
};

// Create VNPay payment URL
const createVnpayPayment = async (req, res) => {
  try {
    const { amount, orderInfo, bankCode, language, orderId } = req.body;

    if (!amount || !orderId) {
      return res.status(200).json({
        status: "ERR",
        message: "Amount and orderId are required",
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
      orderInfo,
      bankCode: bankCode || '',
      language: language || 'vn',
      orderId,
      ipAddr
    };

    const response = await PaymentService.createVnpayPaymentUrl(paymentData);
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
const vnpayReturn = async (req, res) => {
  try {
    const vnpParams = req.query;
    const response = await PaymentService.processVnpayReturn(vnpParams);

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
      message: e.message || "An error occurred while processing VNPay payment return",
    });
  }
};

// Process IPN callback from VNPay
const vnpayIpn = async (req, res) => {
  try {
    const vnpParams = req.query;
    const response = await PaymentService.processVnpayReturn(vnpParams);

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
    console.error("Error processing VNPay IPN:", e);
    return res.status(200).json({
      RspCode: "99",
      Message: "Unknown error"
    });
  }
};

//update Payment
const updatePayment = async (req, res) => {
  try {
    const PaymentId = req.params.id;
    const data = req.body;
    if (!PaymentId) {
      return res.status(200).json({
        status: "ERR",
        message: "The PaymentId is required",
      });
    }

    const response = await PaymentService.updatePayment(PaymentId, data);
    return res.status(200).json(response);
  } catch (e) {
    return res.status(404).json({
      message: e,
    });
  }
};

//delete Payment
const deletePayment = async (req, res) => {
  try {
    const PaymentId = req.params.id;
    //const token = req.headers;

    if (!PaymentId) {
      return res.status(200).json({
        status: "ERR",
        message: "The PaymentId is required",
      });
    }

    const response = await PaymentService.deletePayment(PaymentId);
    return res.status(200).json(response);
  } catch (e) {
    return res.status(404).json({
      message: e,
    });
  }
};

//get details Payment
const getDetailsPayment = async (req, res) => {
  try {
    const PaymentId = req.params.id;

    if (!PaymentId) {
      return res.status(200).json({
        status: "ERR",
        message: "The PaymentId is required",
      });
    }

    const response = await PaymentService.getDetailsPayment(PaymentId);
    return res.status(200).json(response);
  } catch (e) {
    return res.status(404).json({
      message: e,
    });
  }
};

//get all Payment
const getAllPayment = async (req, res) => {
  try {
    const { limit, page, sort, filter } = req.query;
    const response = await PaymentService.getAllPayment(
      Number(limit) || 8,
      Number(page) || 0,
      sort,
      filter
    );
    return res.status(200).json(response);
  } catch (e) {
    return res.status(404).json({
      message: e,
    });
  }
};

module.exports = {
  createPayment,
  updatePayment,
  deletePayment,
  getDetailsPayment,
  getAllPayment,
  createVnpayPayment,
  vnpayReturn,
  vnpayIpn
};
