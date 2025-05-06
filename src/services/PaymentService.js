const Payment = require("../models/PaymentModel");
const Order = require("../models/OrderModel");
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

// Create VNPay payment URL
const createPaymentUrl = (paymentData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { amount, orderInfo, bankCode, language, orderId, ipAddr } = paymentData;

      // Get the order details
      const order = await Order.findById(orderId);
      if (!order) {
        return resolve({
          status: "ERR",
          message: "Order not found"
        });
      }

      // Set timezone
      process.env.TZ = 'Asia/Ho_Chi_Minh';

      // Create date object
      const date = new Date();
      const createDate = moment(date).format('YYYYMMDDHHmmss');

      // Create transaction reference
      const txnRef = moment(date).format('HHmmss') + orderId.toString().slice(-6);

      // Create VNPay parameters
      let vnpParams = {};
      vnpParams['vnp_Version'] = '2.1.0';
      vnpParams['vnp_Command'] = 'pay';
      vnpParams['vnp_TmnCode'] = vnpayConfig.vnp_TmnCode;
      vnpParams['vnp_Locale'] = language || 'vn';
      vnpParams['vnp_CurrCode'] = 'VND';
      vnpParams['vnp_TxnRef'] = txnRef;
      vnpParams['vnp_OrderInfo'] = orderInfo || `Thanh toan don hang ${orderId}`;
      vnpParams['vnp_OrderType'] = 'billpayment';
      vnpParams['vnp_Amount'] = Math.round(amount * 100);
      vnpParams['vnp_ReturnUrl'] = vnpayConfig.vnp_ReturnUrl;
      vnpParams['vnp_IpAddr'] = ipAddr || '127.0.0.1';
      vnpParams['vnp_CreateDate'] = createDate;

      if (bankCode && bankCode !== '') {
        vnpParams['vnp_BankCode'] = bankCode;
      }

      // Sort the parameters
      vnpParams = sortObject(vnpParams);

      // Create signature
      let signData = querystring.stringify(vnpParams);
      let hmac = crypto.createHmac("sha512", vnpayConfig.vnp_HashSecret);
      let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

      vnpParams['vnp_SecureHash'] = signed;

      // Create payment URL
      const paymentUrl = vnpayConfig.vnp_Url + '?' + querystring.stringify(vnpParams);

      try {
        // Create a record in the Payment model
        const payment = await Payment.create({
          paymentCode: txnRef,
          orderId: orderId,
          amount: amount,
          bankCode: bankCode || '',
          orderInfo: orderInfo || `Thanh_toan_don_hang_${orderId}`,
          paymentMethod: 'VNPAY'
        });

        console.log("Payment record created:", payment);
      } catch (paymentError) {
        console.log("Error creating payment record:", paymentError);
        // Continue even if payment record creation fails
      }

      resolve({
        status: "OK",
        message: "SUCCESS",
        code: '00',
        data: paymentUrl,
        txnRef: txnRef
      });
    } catch (e) {
      console.error("Error in createPaymentUrl:", e);
      reject(e);
    }
  });
};

// Process VNPay payment return/IPN
const processPaymentReturn = (vnpParams) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Get secure hash from response
      const secureHash = vnpParams['vnp_SecureHash'];

      // Remove hash from params object before validating
      delete vnpParams['vnp_SecureHash'];
      delete vnpParams['vnp_SecureHashType'];

      // Sort params
      const sortedParams = sortObject(vnpParams);

      // Create signature for validation
      const signData = querystring.stringify(sortedParams, { encode: false });
      const hmac = crypto.createHmac("sha512", vnpayConfig.vnp_HashSecret);
      const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

      // Compare signatures
      if (secureHash === signed) {
        // Get transaction reference and result code
        const txnRef = vnpParams['vnp_TxnRef'];
        const responseCode = vnpParams['vnp_ResponseCode'];

        // Find payment by payment code
        const payment = await Payment.findOne({ paymentCode: txnRef });
        if (!payment) {
          return resolve({
            status: "ERR",
            message: "Payment not found",
            code: '01'
          });
        }

        // Get order
        const order = await Order.findById(payment.orderId);
        if (!order) {
          return resolve({
            status: "ERR",
            message: "Order not found",
            code: '02'
          });
        }

        // Update payment details with response data
        payment.bankCode = vnpParams['vnp_BankCode'] || payment.bankCode;
        payment.bankTranNo = vnpParams['vnp_BankTranNo'] || '';
        payment.cardType = vnpParams['vnp_CardType'] || '';
        payment.payDate = vnpParams['vnp_PayDate'] || '';
        payment.responseCode = responseCode;
        payment.transactionStatus = vnpParams['vnp_TransactionStatus'] || '';
        payment.txnRef = txnRef;
        payment.secureHash = secureHash;

        await payment.save();

        // If payment successful (responseCode = '00')
        if (responseCode === '00') {
          // Update order status to paid
          order.isPaid = true;
          order.paidAt = Date.now();
          order.paymentResult = {
            id: txnRef,
            status: 'COMPLETED',
            update_time: moment().format('YYYYMMDDHHmmss'),
            email_address: '',
          };
          await order.save();

          return resolve({
            status: "OK",
            message: "Payment successful",
            code: '00',
            data: vnpParams
          });
        } else {
          return resolve({
            status: "ERR",
            message: "Payment failed",
            code: responseCode,
            data: vnpParams
          });
        }
      } else {
        return resolve({
          status: "ERR",
          message: "Invalid signature",
          code: '97',
          data: null
        });
      }
    } catch (e) {
      console.error("Error processing payment return:", e);
      reject(e);
    }
  });
};

// Get payment details
const getPaymentByOrderId = (orderId) => {
  return new Promise(async (resolve, reject) => {
    try {
      const payment = await Payment.findOne({ orderId: orderId });

      if (!payment) {
        return resolve({
          status: "ERR",
          message: "Payment not found for this order"
        });
      }

      resolve({
        status: "OK",
        message: "SUCCESS",
        data: payment
      });
    } catch (e) {
      console.error("Error getting payment details:", e);
      reject(e);
    }
  });
};

// Get all payments (for admin)
const getAllPayments = (limit, page, sort, filter) => {
  return new Promise(async (resolve, reject) => {
    try {
      const totalPayments = await Payment.countDocuments();
      let query = Payment.find();

      // Apply filter if provided
      if (filter) {
        const label = filter[0];
        const value = filter[1];

        // Special handling for filter by payment status
        if (label === 'status') {
          if (value === 'success') {
            query = query.where('responseCode').equals('00');
          } else if (value === 'failed') {
            query = query.where('responseCode').ne('00');
          }
        } else {
          query = query.where(label).regex(new RegExp(value, 'i'));
        }
      }

      // Apply sorting if provided
      if (sort) {
        const sortOrder = sort[0]; // 'asc' or 'desc'
        const sortField = sort[1]; // field name

        const sortObj = {};
        sortObj[sortField] = sortOrder === 'asc' ? 1 : -1;
        query = query.sort(sortObj);
      } else {
        // Default sort by createdAt descending
        query = query.sort({ createdAt: -1 });
      }

      // Apply pagination
      const skip = page * limit;
      query = query.skip(skip).limit(limit);

      // Populate order details
      query = query.populate({
        path: 'orderId',
        select: 'totalItemPrice shippingPrice user'
      });

      const payments = await query.exec();

      resolve({
        status: "OK",
        message: "Get all payments successful",
        data: payments,
        total: totalPayments,
        pageCurrent: Number(page + 1),
        totalPage: Math.ceil(totalPayments / limit),
      });
    } catch (e) {
      console.error("Error getting all payments:", e);
      reject(e);
    }
  });
};

// Create COD payment
const createCodPayment = (paymentData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { orderId, amount, paymentMethod } = paymentData;

      // Get the order details
      const order = await Order.findById(orderId);
      if (!order) {
        return resolve({
          status: "ERR",
          message: "Order not found"
        });
      }

      // Set timezone
      process.env.TZ = 'Asia/Ho_Chi_Minh';

      // Create date object
      const date = new Date();
      const createDate = moment(date).format('YYYYMMDDHHmmss');

      // Create transaction reference for COD (COD prefix + timestamp + order ID)
      const txnRef = `COD${moment(date).format('HHmmss')}${orderId.toString().slice(-6)}`;

      try {
        // Create a record in the Payment model
        const payment = await Payment.create({
          paymentCode: txnRef,
          orderId: orderId,
          amount: amount,
          bankCode: '',
          orderInfo: `Thanh toan COD cho don hang ${orderId}`,
          paymentMethod: paymentMethod || 'COD',
          responseCode: 'COD_PENDING', // Special code for COD
          transactionStatus: 'PENDING'
        });

        // Update order status
        order.paymentMethod = 'COD';
        order.orderStatus = 'PROCESSING';
        order.paymentResult = {
          id: txnRef,
          status: 'PENDING',
          update_time: moment().format('YYYYMMDDHHmmss'),
          email_address: '',
        };
        await order.save();

        console.log("COD payment record created:", payment);

        resolve({
          status: "OK",
          message: "COD payment processed successfully",
          code: '00',
          data: {
            paymentId: payment._id,
            txnRef: txnRef,
            orderId: orderId
          }
        });
      } catch (paymentError) {
        console.error("Error creating COD payment record:", paymentError);
        reject(paymentError);
      }
    } catch (e) {
      console.error("Error in createCodPayment:", e);
      reject(e);
    }
  });
};

module.exports = {
  createPaymentUrl,
  processPaymentReturn,
  getPaymentByOrderId,
  getAllPayments,
  createCodPayment
};
