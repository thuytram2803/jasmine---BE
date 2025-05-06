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

//tạo Payment
const createPayment = (newPayment) => {
  return new Promise(async (resolve, reject) => {
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
    } = newPayment;

    try {
      // Kiểm tra `orderId` có tồn tại
      const existingOrder = await Order.findById(orderId);
      if (!existingOrder) {
        return resolve({
          status: "ERR",
          message: "Order not found",
        });
      }

      // Tạo `paymentCode` tự động

      const createdPayment = await Payment.create({
        paymentCode,
        paymentName,
        paymentMethod,
        userBank,
        userBankNumber,
        // adminBank,
        // adminBankNumber,
        // adminBankImage,
        orderId,
      });

      if (createdPayment) {
        resolve({
          status: "OK",
          message: "SUCCESS",
          data: createdPayment,
        });
      }
    } catch (e) {
      reject(e);
    }
  });
};

// Create VNPay payment URL
const createVnpayPaymentUrl = (paymentData) => {
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
      let signData = querystring.stringify(vnpParams, { encode: false });
      let hmac = crypto.createHmac("sha512", vnpayConfig.vnp_HashSecret);
      let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

      vnpParams['vnp_SecureHash'] = signed;

      // Create payment URL
      const paymentUrl = vnpayConfig.vnp_Url + '?' + querystring.stringify(vnpParams, { encode: false });

      // Create a record in the Payment model
      const payment = await Payment.create({
        paymentCode: txnRef,
        paymentName: orderInfo || `Thanh toan don hang ${orderId}`,
        paymentMethod: 'vnpay',
        userBank: bankCode || 'VNPAY',
        userBankNumber: '', // Will be updated after successful payment
        orderId: orderId,
      });

      resolve({
        status: "OK",
        message: "SUCCESS",
        code: '00',
        data: paymentUrl,
        txnRef: txnRef
      });
    } catch (e) {
      reject(e);
    }
  });
};

// Process VNPay payment return
const processVnpayReturn = (vnpParams) => {
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

        // If payment successful
        if (responseCode === '00') {
          // Update payment details
          payment.userBankNumber = vnpParams['vnp_CardNumber'] || '';
          await payment.save();

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
      reject(e);
    }
  });
};

//update Payment
const updatePayment = (id, data) => {
  return new Promise(async (resolve, reject) => {
    try {
      //check name created
      const checkPayment = await Payment.findOne({
        _id: id,
      });
      //console.log("checkUser", checkUser);

      //nếu Payment ko tồn tại
      if (checkPayment === null) {
        resolve({
          status: "OK",
          message: "The Payment is not defined",
        });
      }

      const updatedPayment = await Payment.findByIdAndUpdate(id, data, {
        new: true,
      });
      //console.log("updatedPayment", updatedPayment);
      resolve({
        status: "OK",
        message: "SUCCESS",
        data: updatedPayment,
      });
    } catch (e) {
      reject(e);
    }
  });
};

//delete Payment
const deletePayment = (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      //check Payment created
      const checkPayment = await Payment.findOne({
        _id: id,
      });
      //console.log("checkPayment", checkPayment);

      //nếu Payment ko tồn tại
      if (checkPayment === null) {
        resolve({
          status: "OK",
          message: "The Payment is not defined",
        });
      }

      await Payment.findByIdAndDelete(id);
      //console.log("updatedPayment", updatedPayment);
      resolve({
        status: "OK",
        message: "DELETE Payment IS SUCCESS",
      });
    } catch (e) {
      reject(e);
    }
  });
};

//get details Payment
const getDetailsPayment = (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      //check email created
      const Payment = await Payment.findOne({
        _id: id,
      });

      //nếu Payment ko tồn tại
      if (Payment === null) {
        resolve({
          status: "OK",
          message: "The Payment is not defined",
        });
      }

      resolve({
        status: "OK",
        message: "SUCCESS",
        data: Payment,
      });
    } catch (e) {
      reject(e);
    }
  });
};

//get all Payment
const getAllPayment = (limit, page, sort, filter) => {
  return new Promise(async (resolve, reject) => {
    try {
      const totalPayment = await Payment.countDocuments();

      if (filter) {
        const label = filter[0];
        const allPaymentFilter = await Payment.find({
          [label]: { $regex: filter[1] },
        })
          .limit(limit)
          .skip(page * limit); //filter gần đúng
        resolve({
          status: "OK",
          message: "Get all Payment IS SUCCESS",
          data: allPaymentFilter,
          total: totalPayment,
          pageCurrent: Number(page + 1),
          totalPage: Math.ceil(totalPayment / limit),
        });
      }

      if (sort) {
        const objectSort = {};
        objectSort[sort[1]] = sort[0];
        //console.log('objectSort', objectSort)
        const allPaymentSort = await Payment.find()
          .limit(limit)
          .skip(page * limit)
          .sort(objectSort);
        resolve({
          status: "OK",
          message: "Get all Payment IS SUCCESS",
          data: allPaymentSort,
          total: totalPayment,
          pageCurrent: Number(page + 1),
          totalPage: Math.ceil(totalPayment / limit),
        });
      }

      const allPayment = await Payment.find()
        .limit(limit)
        .skip(page * limit);
      resolve({
        status: "OK",
        message: "Get all Payment IS SUCCESS",
        data: allPayment,
        total: totalPayment,
        pageCurrent: Number(page + 1),
        totalPage: Math.ceil(totalPayment / limit),
      });
    } catch (e) {
      reject(e);
    }
  });
};

module.exports = {
  createPayment,
  updatePayment,
  deletePayment,
  getDetailsPayment,
  getAllPayment,
  createVnpayPaymentUrl,
  processVnpayReturn
};
