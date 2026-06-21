const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILES = {
  physical: '/Users/huangdalu/Downloads/小红书电商选品库-yulu_实体商品-2026年.csv',
  virtual: '/Users/huangdalu/Downloads/小红书电商选品库-yulu_虚拟商品-2026年.csv',
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value !== '')) rows.push(row);
  }

  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, '').trim());
  return rows.map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = (values[index] || '').trim();
    });
    return item;
  });
}

function readCsv(file) {
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

function num(value) {
  if (value === undefined || value === null) return 0;
  const cleaned = String(value).replace(/[,%¥]/g, '').trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function avg(values) {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function median(values) {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!usable.length) return 0;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[mid] : (usable[mid - 1] + usable[mid]) / 2;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

function formatInt(value) {
  return Math.round(value).toLocaleString('zh-CN');
}

function formatMoney(value) {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function percentile(values, p) {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!usable.length) return 0;
  const index = Math.min(usable.length - 1, Math.max(0, Math.floor((usable.length - 1) * p)));
  return usable[index];
}

function countBy(rows, getKey) {
  const map = new Map();
  rows.forEach((row) => {
    const key = getKey(row) || '未分类';
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function topEntries(map, limit = 8) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function dist(rows, buckets, getValue) {
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: rows.filter((row) => bucket.test(getValue(row))).length,
  }));
}

const PRICE_BUCKETS = [
  { label: '1-10元', test: (value) => value >= 1 && value < 10 },
  { label: '10-30元', test: (value) => value >= 10 && value < 30 },
  { label: '30-50元', test: (value) => value >= 30 && value < 50 },
  { label: '50-100元', test: (value) => value >= 50 && value < 100 },
  { label: '100-200元', test: (value) => value >= 100 && value < 200 },
  { label: '200元以上', test: (value) => value >= 200 },
];

function priceBandDist(rows) {
  return dist(rows, PRICE_BUCKETS, price).map((item) => ({
    ...item,
    ratio: pct(item.value / Math.max(1, rows.length)),
  }));
}

function price(row) {
  return num(row['到手价']) || num(row['商品原价']);
}

function sales(row) {
  return num(row['商品销量']);
}

function fans(row) {
  return num(row['粉丝数']);
}

function score(row) {
  return num(row['店铺评分']);
}

function isLowFanBest(row) {
  return fans(row) > 0 && fans(row) <= 5000 && sales(row) >= 1000;
}

function competitionLevel(index) {
  if (index >= 70) return '高竞争';
  if (index >= 45) return '中竞争';
  return '低竞争';
}

function levelKey(index) {
  if (index >= 70) return 'h';
  if (index >= 45) return 'm';
  return 'l';
}

function normalizeScore(value, max) {
  if (!max) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function keywordRows(rows, limit = 30) {
  const keywordMap = new Map();
  rows.forEach((row) => {
    const keyword = row['搜索关键词'];
    if (!keyword) return;
    const current = keywordMap.get(keyword) || {
      text: keyword,
      count: 0,
      sales: 0,
      categories: new Map(),
    };
    current.count += 1;
    current.sales += sales(row);
    const category = row['商品分类'] || '未分类';
    current.categories.set(category, (current.categories.get(category) || 0) + 1);
    keywordMap.set(keyword, current);
  });

  return [...keywordMap.values()]
    .sort((a, b) => b.count - a.count || b.sales - a.sales)
    .slice(0, limit)
    .map((item, index) => {
      const category = [...item.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '未分类';
      return {
        text: item.text,
        count: item.count,
        category,
        avgSales: Math.round(item.sales / item.count),
        level: index < 12 ? 'hot' : 'warm',
      };
    });
}

function topProducts(rows, limit = 8) {
  return rows
    .slice()
    .sort((a, b) => sales(b) - sales(a))
    .slice(0, limit)
    .map((row) => ({
      title: row['商品标题'],
      category: row['商品分类'] || '未分类',
      keyword: row['搜索关键词'] || '',
      sales: sales(row),
      price: price(row),
      shop: row['店铺名称'] || '',
      fans: fans(row),
      ratio: num(row['销量粉丝比']),
      trend: row['销量趋势标签'] || '未知',
      url: row['商品链接'] || '',
    }));
}

function growth7(row) {
  return num(row['📈近7天销量增长']);
}

function growth30(row) {
  return num(row['📈近30天销量增长']);
}

function growthAmount(row) {
  return growth7(row) || growth30(row);
}

function growthProducts(rows, limit = 6) {
  return rows
    .filter((row) => growthAmount(row) > 0)
    .slice()
    .sort((a, b) => growthAmount(b) - growthAmount(a) || sales(b) - sales(a))
    .slice(0, limit)
    .map((row) => ({
      title: row['商品标题'],
      url: row['商品链接'] || '',
      keyword: row['搜索关键词'] || '',
      currentSales: sales(row),
      growth7: growth7(row),
      growth30: growth30(row),
      growth: growthAmount(row),
    }));
}

function parseDateValue(value) {
  if (!value) return null;
  const match = String(value).match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/);
  if (!match) return null;
  const [year, month, day] = match[0].replace(/\//g, '-').split('-');
  return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
}

function dateRange(rows) {
  const dates = rows.map((row) => parseDateValue(row['收录时间'])).filter(Boolean).sort();
  return {
    start: dates[0] || '',
    end: dates[dates.length - 1] || '',
  };
}

function buildReport(type, rows) {
  const products = rows.length;
  const shops = uniqueCount(rows.map((row) => row['店铺名称']));
  const salesValues = rows.map(sales);
  const priceValues = rows.map(price);
  const lowFanRows = rows.filter(isLowFanBest);
  const maxCategoryProducts = Math.max(...topEntries(countBy(rows, (row) => row['商品分类']), 50).map((item) => item.value), 1);
  const maxCategorySales = Math.max(
    ...[...countBy(rows, (row) => row['商品分类']).keys()].map((category) =>
      sum(rows.filter((row) => (row['商品分类'] || '未分类') === category).map(sales))
    ),
    1
  );

  const categories = [...countBy(rows, (row) => row['商品分类']).keys()]
    .map((name) => {
      const group = rows.filter((row) => (row['商品分类'] || '未分类') === name);
      const groupSales = group.map(sales);
      const groupPrices = group.map(price);
      const groupTotalSales = sum(groupSales);
      const groupShops = uniqueCount(group.map((row) => row['店铺名称']));
      const lowFanRate = group.filter(isLowFanBest).length / group.length;
      const productsPerShop = groupShops ? group.length / groupShops : 0;
      const competitionIndex = Math.round(
        normalizeScore(group.length, maxCategoryProducts) * 0.5 +
        normalizeScore(productsPerShop, 4) * 0.5
      );
      const keywords = topEntries(countBy(group, (row) => row['搜索关键词']), 3).map((item) => item.label);
      const subCategories = rowHas(group, '商品二级分类')
        ? topEntries(countBy(group, (row) => row['商品二级分类']), 3).map((item) => item.label)
        : [];

      return {
        name,
        products: group.length,
        shops: groupShops,
        totalSales: groupTotalSales,
        avgSales: Math.round(avg(groupSales)),
        medianSales: Math.round(median(groupSales)),
        avgPrice: Math.round(avg(groupPrices)),
        medianPrice: Math.round(median(groupPrices)),
        lowFanRate: pct(lowFanRate),
        productsPerShop: Number(productsPerShop.toFixed(2)),
        competitionIndex,
        competitionLevel: competitionLevel(competitionIndex),
        heat: levelKey(competitionIndex),
        priceBands: priceBandDist(group),
        growthProducts: growthProducts(group),
        keywords,
        subCategories,
      };
    })
    .sort((a, b) => b.products - a.products);

  const categoryTopByProducts = categories.slice().sort((a, b) => b.products - a.products).slice(0, 12);
  const sourceRange = dateRange(rows);

  const report = {
    label: type === 'physical' ? '实体商品' : '虚拟商品',
    sourceRange,
    overview: {
      products,
      shops,
      avgSales: Math.round(avg(salesValues)),
      medianSales: Math.round(median(salesValues)),
      avgPrice: Math.round(avg(priceValues)),
      medianPrice: Math.round(median(priceValues)),
      productsPerShop: Number((products / shops).toFixed(2)),
      lowFanBests: lowFanRows.length,
      lowFanRate: pct(lowFanRows.length / products),
      categories: categories.length,
    },
    distributions: {
      fans: dist(rows, [
        { label: '<1千', test: (value) => value < 1000 },
        { label: '1千-5千', test: (value) => value >= 1000 && value < 5000 },
        { label: '1万-5万', test: (value) => value >= 10000 && value < 50000 },
        { label: '>10万', test: (value) => value >= 100000 },
      ], fans),
      score: dist(rows, [
        { label: '<4.4', test: (value) => value > 0 && value < 4.4 },
        { label: '4.4-4.6', test: (value) => value >= 4.4 && value < 4.6 },
        { label: '4.6-4.8', test: (value) => value >= 4.6 && value < 4.8 },
        { label: '4.8-5.0', test: (value) => value >= 4.8 },
      ], score),
    },
    categories,
    categoryProducts: categoryTopByProducts.map((item) => ({ label: item.name, value: item.products })),
    keywords: keywordRows(rows),
    growthByCategory: categories
      .filter((category) => !(type === 'virtual' && category.name === '无匹配类别'))
      .map((category) => ({
        name: category.name,
        products: category.growthProducts,
      }))
      .filter((category) => category.products.length),
  };

  return report;
}

function rowHas(rows, key) {
  return rows.some((row) => row[key]);
}

const physicalRows = readCsv(SOURCE_FILES.physical);
const virtualRows = readCsv(SOURCE_FILES.virtual);
const now = new Date();
const generated = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(now).replace(/\//g, '-');

const DATA = {
  meta: {
    title: '小红书电商选品分析看板',
    generated,
    source: '小红书电商选品库-yulu',
    sampleRule: '原始CSV全量统计；低粉爆款定义为粉丝数≤5000且商品销量≥1000',
    totalProducts: physicalRows.length + virtualRows.length,
  },
  physical: buildReport('physical', physicalRows),
  virtual: buildReport('virtual', virtualRows),
};

fs.writeFileSync(
  path.join(ROOT, 'xhs_product_data.js'),
  `const DATA = ${JSON.stringify(DATA, null, 2)};\n`,
  'utf8'
);

console.log(`Generated xhs_product_data.js with ${DATA.meta.totalProducts.toLocaleString('zh-CN')} products.`);
