const Product = require('../models/ProductModel');
const User = require('../models/UserModel');
const { getRecommendedProductsForUser } = require('../services/RecommendationService');

class ChatbotController {
  // Process user queries and generate responses
  async processQuery(req, res) {
    try {
      const { query, userId } = req.body;

      if (!query) {
        return res.status(400).json({
          status: 'ERR',
          message: 'Vui lòng cung cấp nội dung truy vấn'
        });
      }

      // In a real implementation, this would call the Google Aloud API
      // For now, we'll implement basic processing logic

      let responseData = {
        message: '',
        data: null
      };

      // Define common greetings
      const greetings = ['hi', 'hello', 'xin chào', 'chào', 'hey', 'alo', 'hola'];

      // Check if query is a greeting
      const isGreeting = greetings.some(greeting =>
        query.toLowerCase().trim() === greeting ||
        query.toLowerCase().trim().startsWith(greeting + ' ')
      );

      // Handle greetings specially
      if (isGreeting) {
        responseData.message = 'Xin chào! Tôi là trợ lý AI của hiệu sách BookStore. Tôi có thể giúp bạn tìm sách, cung cấp thông tin về sản phẩm, hỗ trợ đặt hàng, và trả lời các câu hỏi về chính sách của cửa hàng. Bạn cần hỗ trợ gì ạ?';

        return res.status(200).json({
          status: 'OK',
          ...responseData
        });
      }

      // Define bookstore-related keywords
      const bookstoreKeywords = [
        'sách', 'book', 'tìm', 'đọc', 'tác giả', 'author', 'thể loại', 'category',
        'giá', 'price', 'gợi ý', 'recommend', 'đề xuất', 'thanh toán', 'payment',
        'mua', 'giao hàng', 'shipping', 'vận chuyển', 'đổi trả', 'hoàn tiền', 'return',
        'khuyến mãi', 'giảm giá', 'discount', 'đặt hàng', 'bookstore'
      ];

      // Check if query contains any bookstore-related keywords
      const isBookstoreQuery = bookstoreKeywords.some(keyword =>
        query.toLowerCase().includes(keyword)
      );

      // If not a bookstore-related query, return a general response about knowledge limitations
      if (!isBookstoreQuery) {
        responseData.message = 'Về câu hỏi của bạn: Xin lỗi, tôi là trợ lý của hiệu sách và được thiết kế chủ yếu để trả lời các câu hỏi liên quan đến sách và dịch vụ của hiệu sách. Để có trải nghiệm tốt hơn, bạn nên sử dụng chế độ AI bằng cách nhấn nút "AI" phía trên. Khi đó tôi có thể trả lời mọi câu hỏi kiến thức chung của bạn.';

        return res.status(200).json({
          status: 'OK',
          ...responseData
        });
      }

      // Search for books
      if (query.toLowerCase().includes('sách') ||
          query.toLowerCase().includes('tìm') ||
          query.toLowerCase().includes('book')) {

        // Extract search terms
        const searchTerms = query.replace(/tìm sách|sách|tìm|book/gi, '').trim();

        if (searchTerms) {
          // Search by name, author, or category
          const products = await Product.find({
            $or: [
              { productName: { $regex: searchTerms, $options: 'i' } },
              { author: { $regex: searchTerms, $options: 'i' } },
              { publisher: { $regex: searchTerms, $options: 'i' } }
            ]
          }).limit(5);

          if (products && products.length > 0) {
            responseData.message = `Tôi đã tìm thấy ${products.length} sách phù hợp.`;
            responseData.data = products;
          } else {
            responseData.message = `Tôi không tìm thấy sách phù hợp với từ khóa "${searchTerms}". Bạn có thể thử với từ khóa khác.`;
          }
        } else {
          responseData.message = 'Bạn muốn tìm sách gì? Vui lòng cho tôi biết tên sách, tác giả hoặc thể loại bạn quan tâm.';
        }
      }
      // Book recommendations
      else if (query.toLowerCase().includes('gợi ý') ||
               query.toLowerCase().includes('đề xuất') ||
               query.toLowerCase().includes('recommend')) {

        if (userId) {
          const recommendations = await getRecommendedProductsForUser(userId);

          if (recommendations && recommendations.length > 0) {
            responseData.message = 'Dựa trên sở thích của bạn, tôi đề xuất những cuốn sách sau:';
            responseData.data = recommendations;
          } else {
            responseData.message = 'Hiện tại chúng tôi chưa có đủ dữ liệu để đề xuất sách phù hợp cho bạn. Hãy khám phá và tương tác với nhiều sách hơn để nhận được gợi ý tốt hơn.';
          }
        } else {
          responseData.message = 'Để nhận gợi ý sách phù hợp với sở thích của bạn, vui lòng đăng nhập tài khoản trước.';
        }
      }
      // Payment information
      else if (query.toLowerCase().includes('thanh toán') ||
               query.toLowerCase().includes('payment') ||
               query.toLowerCase().includes('mua')) {

        responseData.message = 'Chúng tôi hỗ trợ các phương thức thanh toán sau:\n\n' +
                      '1. Thanh toán trực tuyến qua thẻ tín dụng/ghi nợ\n' +
                      '2. Chuyển khoản ngân hàng\n' +
                      '3. Thanh toán khi nhận hàng (COD)\n\n' +
                      'Bạn có thể chọn phương thức thanh toán phù hợp trong quá trình thanh toán sau khi đặt hàng.';
      }
      // Shipping information
      else if (query.toLowerCase().includes('giao hàng') ||
               query.toLowerCase().includes('shipping') ||
               query.toLowerCase().includes('vận chuyển')) {

        responseData.message = 'Thông tin về giao hàng:\n\n' +
                      '- Đơn hàng sẽ được xử lý trong vòng 24 giờ sau khi đặt hàng thành công\n' +
                      '- Thời gian giao hàng: 2-5 ngày làm việc tùy khu vực\n' +
                      '- Phí giao hàng: 30.000 VND (miễn phí cho đơn hàng từ 300.000 VND)\n\n' +
                      'Bạn có thể theo dõi trạng thái đơn hàng trong mục "Đơn hàng của tôi" sau khi đăng nhập.';
      }
      // Return policy
      else if (query.toLowerCase().includes('đổi trả') ||
               query.toLowerCase().includes('hoàn tiền') ||
               query.toLowerCase().includes('return')) {

        responseData.message = 'Chính sách đổi trả của BookStore:\n\n' +
                      '- Thời gian đổi trả: trong vòng 7 ngày kể từ ngày nhận hàng\n' +
                      '- Điều kiện: sách còn nguyên vẹn, không có dấu hiệu sử dụng\n' +
                      '- Hoàn tiền: trong vòng 7-14 ngày tùy phương thức thanh toán\n\n' +
                      'Để đổi trả, vui lòng liên hệ hotline 1900-1234 hoặc gửi yêu cầu qua email support@bookstore.com';
      }
      // Promotions
      else if (query.toLowerCase().includes('khuyến mãi') ||
               query.toLowerCase().includes('giảm giá') ||
               query.toLowerCase().includes('discount')) {

        responseData.message = 'Các chương trình khuyến mãi hiện tại:\n\n' +
                      '- Giảm 10% cho đơn hàng từ 200.000 VND\n' +
                      '- Giảm 15% cho đơn hàng từ 500.000 VND\n' +
                      '- Mua 2 tặng 1 cho sách văn học\n\n' +
                      'Bạn có thể xem thêm thông tin khuyến mãi tại trang chủ hoặc mục "Khuyến mãi".';
      }
      // Default response
      else {
        responseData.message = 'Xin lỗi, tôi chưa hiểu rõ câu hỏi của bạn. Tôi có thể giúp bạn:\n\n' +
                      '- Tìm sách theo tên, tác giả, thể loại\n' +
                      '- Gợi ý sách phù hợp với sở thích của bạn\n' +
                      '- Cung cấp thông tin về sách\n' +
                      '- Hỗ trợ quy trình đặt hàng, vận chuyển và thanh toán\n' +
                      '- Trả lời các câu hỏi về chính sách đổi trả, khuyến mãi\n\n' +
                      'Vui lòng cho tôi biết bạn cần hỗ trợ gì?';
      }

      return res.status(200).json({
        status: 'OK',
        ...responseData
      });

    } catch (error) {
      console.error('Error in chatbot processing:', error);
      return res.status(500).json({
        status: 'ERR',
        message: 'Xin lỗi, đã xảy ra lỗi khi xử lý yêu cầu của bạn.'
      });
    }
  }

  // Get book details by ID
  async getBookDetails(req, res) {
    try {
      const { productId } = req.params;

      if (!productId) {
        return res.status(400).json({
          status: 'ERR',
          message: 'Vui lòng cung cấp ID sách'
        });
      }

      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({
          status: 'ERR',
          message: 'Không tìm thấy sách'
        });
      }

      return res.status(200).json({
        status: 'OK',
        data: product
      });

    } catch (error) {
      console.error('Error getting book details:', error);
      return res.status(500).json({
        status: 'ERR',
        message: 'Xin lỗi, đã xảy ra lỗi khi lấy thông tin sách.'
      });
    }
  }
}

module.exports = new ChatbotController();