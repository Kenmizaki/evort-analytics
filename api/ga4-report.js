const { BetaAnalyticsDataClient } = require('@google-analytics/data');

// GA4 Property ID
const PROPERTY_ID = '257667457';

// サービスアカウント認証情報（環境変数から取得）
const credentials = {
  client_email: process.env.GA_CLIENT_EMAIL,
  private_key: process.env.GA_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

const analyticsDataClient = new BetaAnalyticsDataClient({ credentials });

// Vercel Serverless Function形式 (CommonJS)
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const params = req.query || {};
    const reportType = params.type || 'overview';
    const startDate = params.startDate || '30daysAgo';
    const endDate = params.endDate || 'today';
    const companyFilter = params.company || null;

    let response;

    // 追加フィルターパラメータ
    const urlFilter = params.url || null;
    const urlMatchType = params.urlMatchType || 'contains'; // 'exact', 'prefix', 'contains'
    const prefectureFilter = params.prefecture || null;
    const industryFilter = params.industry || null;
    const employeesFilter = params.employees || null;

    switch (reportType) {
      case 'overview':
        response = await getOverviewReport(startDate, endDate);
        break;
      case 'overview-by-url':
        response = await getOverviewByUrlReport(startDate, endDate, urlFilter, urlMatchType);
        break;
      case 'daily-trend':
        response = await getDailyTrendReport(startDate, endDate, urlFilter, urlMatchType);
        break;
      case 'regions':
        response = await getRegionsReport(startDate, endDate, urlFilter, urlMatchType);
        break;
      case 'devices':
        response = await getDevicesReport(startDate, endDate, urlFilter, urlMatchType);
        break;
      case 'companies':
        response = await getCompaniesReport(startDate, endDate, {
          urlFilter,
          urlMatchType,
          prefectureFilter,
          industryFilter,
          employeesFilter,
        });
        break;
      case 'pages':
        response = await getPagesReport(startDate, endDate, companyFilter);
        break;
      case 'realtime':
        response = await getRealtimeReport();
        break;
      case 'company-detail':
        response = await getCompanyDetailReport(startDate, endDate, companyFilter);
        break;
      case 'companies-by-url':
        response = await getCompaniesByUrlReport(startDate, endDate, urlFilter);
        break;
      case 'subpages':
        response = await getSubpagesReport(startDate, endDate, urlFilter);
        break;
      default:
        response = await getOverviewReport(startDate, endDate);
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('GA4 API Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// 概要レポート
async function getOverviewReport(startDate, endDate) {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' },
    ],
  });

  const metrics = response.rows?.[0]?.metricValues || [];
  return {
    type: 'overview',
    data: {
      activeUsers: parseInt(metrics[0]?.value || 0),
      sessions: parseInt(metrics[1]?.value || 0),
      pageViews: parseInt(metrics[2]?.value || 0),
      avgSessionDuration: parseFloat(metrics[3]?.value || 0),
      bounceRate: parseFloat(metrics[4]?.value || 0),
    },
  };
}

// URL別概要レポート（URLフィルター付きでPV/セッション/ユーザーを取得）
async function getOverviewByUrlReport(startDate, endDate, urlFilter, urlMatchType) {
  const request = {
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
    ],
  };

  if (urlFilter) {
    let gaMatchType = 'CONTAINS';
    if (urlMatchType === 'exact') {
      gaMatchType = 'EXACT';
    } else if (urlMatchType === 'prefix') {
      gaMatchType = 'BEGINS_WITH';
    }
    request.dimensionFilter = {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { value: urlFilter, matchType: gaMatchType },
      },
    };
  }

  const [response] = await analyticsDataClient.runReport(request);
  const metrics = response.rows?.[0]?.metricValues || [];

  return {
    type: 'overview-by-url',
    data: {
      activeUsers: parseInt(metrics[0]?.value || 0),
      sessions: parseInt(metrics[1]?.value || 0),
      pageViews: parseInt(metrics[2]?.value || 0),
      avgSessionDuration: parseFloat(metrics[3]?.value || 0),
    },
  };
}

// 日別推移レポート（PVの日別推移）
async function getDailyTrendReport(startDate, endDate, urlFilter, urlMatchType) {
  const request = {
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'activeUsers' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
  };

  if (urlFilter) {
    let gaMatchType = 'CONTAINS';
    if (urlMatchType === 'exact') {
      gaMatchType = 'EXACT';
    } else if (urlMatchType === 'prefix') {
      gaMatchType = 'BEGINS_WITH';
    }
    request.dimensionFilter = {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { value: urlFilter, matchType: gaMatchType },
      },
    };
  }

  const [response] = await analyticsDataClient.runReport(request);

  const dailyData = (response.rows || []).map((row) => {
    const dateStr = row.dimensionValues[0]?.value || '';
    // YYYYMMDD形式をMM/DD形式に変換
    const formatted = dateStr.length === 8
      ? `${dateStr.slice(4, 6)}/${dateStr.slice(6, 8)}`
      : dateStr;
    return {
      date: formatted,
      pv: parseInt(row.metricValues[0]?.value || 0),
      sessions: parseInt(row.metricValues[1]?.value || 0),
      users: parseInt(row.metricValues[2]?.value || 0),
    };
  });

  return {
    type: 'daily-trend',
    data: dailyData,
  };
}

// 地域別レポート（GA4のregionディメンションを使用）
async function getRegionsReport(startDate, endDate, urlFilter, urlMatchType) {
  const request = {
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'region' }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 20,
  };

  if (urlFilter) {
    let gaMatchType = 'CONTAINS';
    if (urlMatchType === 'exact') {
      gaMatchType = 'EXACT';
    } else if (urlMatchType === 'prefix') {
      gaMatchType = 'BEGINS_WITH';
    }
    request.dimensionFilter = {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { value: urlFilter, matchType: gaMatchType },
      },
    };
  }

  const [response] = await analyticsDataClient.runReport(request);

  const regions = (response.rows || []).map((row) => ({
    name: row.dimensionValues[0]?.value || '(not set)',
    sessions: parseInt(row.metricValues[0]?.value || 0),
    users: parseInt(row.metricValues[1]?.value || 0),
    pageViews: parseInt(row.metricValues[2]?.value || 0),
  }));

  // 合計セッション数を計算してパーセンテージを追加
  const totalSessions = regions.reduce((sum, r) => sum + r.sessions, 0) || 1;
  const regionsWithPercent = regions.map((r) => ({
    ...r,
    percent: ((r.sessions / totalSessions) * 100).toFixed(1),
  }));

  return {
    type: 'regions',
    data: regionsWithPercent,
  };
}

// デバイス別レポート（GA4のdeviceCategoryディメンションを使用）
async function getDevicesReport(startDate, endDate, urlFilter, urlMatchType) {
  const request = {
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  };

  if (urlFilter) {
    let gaMatchType = 'CONTAINS';
    if (urlMatchType === 'exact') {
      gaMatchType = 'EXACT';
    } else if (urlMatchType === 'prefix') {
      gaMatchType = 'BEGINS_WITH';
    }
    request.dimensionFilter = {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { value: urlFilter, matchType: gaMatchType },
      },
    };
  }

  const [response] = await analyticsDataClient.runReport(request);

  const deviceColors = {
    desktop: '#8b5cf6',
    mobile: '#22c55e',
    tablet: '#f97316',
  };

  const totalSessions = (response.rows || []).reduce(
    (sum, row) => sum + parseInt(row.metricValues[0]?.value || 0),
    0
  ) || 1;

  const devices = (response.rows || []).map((row) => {
    const name = row.dimensionValues[0]?.value || 'other';
    const sessions = parseInt(row.metricValues[0]?.value || 0);
    return {
      name: name === 'desktop' ? 'PC' : name === 'mobile' ? 'Mobile' : name === 'tablet' ? 'Tablet' : name,
      value: Math.round((sessions / totalSessions) * 100),
      color: deviceColors[name.toLowerCase()] || '#94a3b8',
      sessions,
    };
  });

  return {
    type: 'devices',
    data: devices,
  };
}

// 企業別レポート（どこどこJPカスタムディメンション使用）
async function getCompaniesReport(startDate, endDate, filters = {}) {
  const { urlFilter, urlMatchType, prefectureFilter, industryFilter, employeesFilter } = filters;

  // フィルター条件を構築
  const dimensionFilters = [];

  if (urlFilter) {
    // urlMatchType: 'exact' = 完全一致, 'prefix' = 前方一致, 'contains' = 含む
    let gaMatchType = 'CONTAINS';
    if (urlMatchType === 'exact') {
      gaMatchType = 'EXACT';
    } else if (urlMatchType === 'prefix') {
      gaMatchType = 'BEGINS_WITH';
    }
    dimensionFilters.push({
      filter: {
        fieldName: 'pagePath',
        stringFilter: { value: urlFilter, matchType: gaMatchType },
      },
    });
  }

  if (prefectureFilter) {
    dimensionFilters.push({
      filter: {
        fieldName: 'customUser:pref',
        stringFilter: { value: prefectureFilter, matchType: 'EXACT' },
      },
    });
  }

  if (industryFilter) {
    dimensionFilters.push({
      filter: {
        fieldName: 'customUser:industrialCategoryL',
        stringFilter: { value: industryFilter, matchType: 'CONTAINS' },
      },
    });
  }

  if (employeesFilter) {
    dimensionFilters.push({
      filter: {
        fieldName: 'customUser:employees',
        stringFilter: { value: employeesFilter, matchType: 'EXACT' },
      },
    });
  }

  const request = {
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'customUser:name' },           // 企業名
      { name: 'customUser:pref' },           // 都道府県
      { name: 'customUser:industrialCategoryL' }, // 業種大分類
      { name: 'customUser:employees' },      // 従業員数
    ],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 100,
  };

  // フィルターがある場合は追加
  if (dimensionFilters.length > 0) {
    if (dimensionFilters.length === 1) {
      request.dimensionFilter = dimensionFilters[0];
    } else {
      request.dimensionFilter = {
        andGroup: { expressions: dimensionFilters },
      };
    }
  }

  const [response] = await analyticsDataClient.runReport(request);

  const companies = (response.rows || []).map((row) => ({
    name: row.dimensionValues[0]?.value || '不明',
    prefecture: row.dimensionValues[1]?.value || '',
    industry: row.dimensionValues[2]?.value || '',
    employees: row.dimensionValues[3]?.value || '',
    capitalStock: '',  // GA4にディメンションがない場合は空
    sales: '',         // GA4にディメンションがない場合は空
    activeUsers: parseInt(row.metricValues[0]?.value || 0),
    sessions: parseInt(row.metricValues[1]?.value || 0),
    pageViews: parseInt(row.metricValues[2]?.value || 0),
    avgDuration: parseFloat(row.metricValues[3]?.value || 0),
  }));

  return { type: 'companies', data: companies, filters: { urlFilter, prefectureFilter, industryFilter, employeesFilter } };
}

// ページ別レポート
async function getPagesReport(startDate, endDate, companyFilter) {
  const request = {
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'pagePath' },
      { name: 'pageTitle' },
    ],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'activeUsers' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 50,
  };

  // 企業フィルタがある場合
  if (companyFilter) {
    request.dimensionFilter = {
      filter: {
        fieldName: 'customUser:name',
        stringFilter: { value: companyFilter, matchType: 'EXACT' },
      },
    };
  }

  const [response] = await analyticsDataClient.runReport(request);

  const pages = (response.rows || []).map((row) => ({
    path: row.dimensionValues[0]?.value || '',
    title: row.dimensionValues[1]?.value || '',
    pageViews: parseInt(row.metricValues[0]?.value || 0),
    users: parseInt(row.metricValues[1]?.value || 0),
    avgDuration: parseFloat(row.metricValues[2]?.value || 0),
  }));

  return { type: 'pages', data: pages };
}

// リアルタイムレポート
async function getRealtimeReport() {
  // シンプルにアクティブユーザー数のみ取得
  const [response] = await analyticsDataClient.runRealtimeReport({
    property: `properties/${PROPERTY_ID}`,
    metrics: [{ name: 'activeUsers' }],
  });

  const totalUsers = parseInt(response.rows?.[0]?.metricValues?.[0]?.value || 0);

  return {
    type: 'realtime',
    data: {
      totalActiveUsers: totalUsers,
      companies: [], // リアルタイムでは企業別データは取得できない
    },
  };
}

// 企業詳細レポート
async function getCompanyDetailReport(startDate, endDate, companyName) {
  if (!companyName) {
    return { type: 'company-detail', error: 'Company name required' };
  }

  // 訪問履歴
  const [visitResponse] = await analyticsDataClient.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'sessions' },
      { name: 'screenPageViews' },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'customUser:name',
        stringFilter: { value: companyName, matchType: 'EXACT' },
      },
    },
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
  });

  // 閲覧ページ
  const [pageResponse] = await analyticsDataClient.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'pagePath' },
      { name: 'pageTitle' },
    ],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter: {
      filter: {
        fieldName: 'customUser:name',
        stringFilter: { value: companyName, matchType: 'EXACT' },
      },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 20,
  });

  const visits = (visitResponse.rows || []).map((row) => ({
    date: row.dimensionValues[0]?.value || '',
    sessions: parseInt(row.metricValues[0]?.value || 0),
    pageViews: parseInt(row.metricValues[1]?.value || 0),
  }));

  const pages = (pageResponse.rows || []).map((row) => ({
    path: row.dimensionValues[0]?.value || '',
    title: row.dimensionValues[1]?.value || '',
    pageViews: parseInt(row.metricValues[0]?.value || 0),
  }));

  return {
    type: 'company-detail',
    data: {
      companyName,
      visits,
      pages,
    },
  };
}

// URL別企業レポート（特定のURLを閲覧した企業一覧）
async function getCompaniesByUrlReport(startDate, endDate, urlPath) {
  if (!urlPath) {
    return { type: 'companies-by-url', error: 'URL path required' };
  }

  const [response] = await analyticsDataClient.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'customUser:name' },
      { name: 'customUser:pref' },
      { name: 'customUser:industrialCategoryL' },
      { name: 'customUser:employees' },
      { name: 'pagePath' },
    ],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { value: urlPath, matchType: 'CONTAINS' },
      },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 100,
  });

  // 企業ごとに集約
  const companyMap = new Map();
  (response.rows || []).forEach((row) => {
    const name = row.dimensionValues[0]?.value || '不明';
    if (!companyMap.has(name)) {
      companyMap.set(name, {
        name,
        prefecture: row.dimensionValues[1]?.value || '',
        industry: row.dimensionValues[2]?.value || '',
        employees: row.dimensionValues[3]?.value || '',
        pageViews: 0,
        sessions: 0,
        viewedPages: [],
      });
    }
    const company = companyMap.get(name);
    company.pageViews += parseInt(row.metricValues[0]?.value || 0);
    company.sessions += parseInt(row.metricValues[1]?.value || 0);
    company.viewedPages.push(row.dimensionValues[4]?.value || '');
  });

  const companies = Array.from(companyMap.values())
    .sort((a, b) => b.pageViews - a.pageViews);

  return {
    type: 'companies-by-url',
    data: {
      urlPath,
      companies,
    },
  };
}

// 子ページ一覧取得（指定URLパス配下のページをタイトル付きで取得）
async function getSubpagesReport(startDate, endDate, parentPath) {
  if (!parentPath) {
    return { type: 'subpages', error: 'Parent path required' };
  }

  const [response] = await analyticsDataClient.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'pagePath' },
      { name: 'pageTitle' },
    ],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'activeUsers' },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { value: parentPath, matchType: 'BEGINS_WITH' },
      },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 100,
  });

  const pages = (response.rows || []).map((row) => ({
    path: row.dimensionValues[0]?.value || '',
    title: row.dimensionValues[1]?.value || '',
    pageViews: parseInt(row.metricValues[0]?.value || 0),
    sessions: parseInt(row.metricValues[1]?.value || 0),
    activeUsers: parseInt(row.metricValues[2]?.value || 0),
  }));

  return {
    type: 'subpages',
    data: {
      parentPath,
      pages,
    },
  };
}
