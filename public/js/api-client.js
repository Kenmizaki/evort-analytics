/**
 * GA4 API Client
 * Netlify Functionsを通じてGA4データを取得
 */
class AnalyticsAPI {
  constructor(baseUrl = '') {
    // Netlify Functions のエンドポイント
    this.baseUrl = baseUrl || '/.netlify/functions/ga4-report';
  }

  async fetch(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}?${queryString}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('API fetch error:', error);
      throw error;
    }
  }

  // 概要データ取得
  async getOverview(startDate = '30daysAgo', endDate = 'today') {
    return this.fetch({ type: 'overview', startDate, endDate });
  }

  // 企業一覧取得
  async getCompanies(startDate = '30daysAgo', endDate = 'today') {
    return this.fetch({ type: 'companies', startDate, endDate });
  }

  // ページ別データ取得
  async getPages(startDate = '30daysAgo', endDate = 'today', company = null) {
    const params = { type: 'pages', startDate, endDate };
    if (company) params.company = company;
    return this.fetch(params);
  }

  // リアルタイムデータ取得
  async getRealtime() {
    return this.fetch({ type: 'realtime' });
  }

  // 企業詳細取得
  async getCompanyDetail(companyName, startDate = '30daysAgo', endDate = 'today') {
    return this.fetch({
      type: 'company-detail',
      company: companyName,
      startDate,
      endDate
    });
  }
}

// グローバルにエクスポート
window.AnalyticsAPI = AnalyticsAPI;
