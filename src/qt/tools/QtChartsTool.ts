/**
 * QtCharts — QChart reference and code generator.
 * Provides instant reference for QChart types, series configuration,
 * axis setup, and common chart patterns with example code.
 */
export function executeQtCharts(chartType?: string): string {
  const lines: string[] = [];
  lines.push('## Qt Charts Reference\n');

  if (chartType) {
    const ref = getChartReference(chartType.toLowerCase());
    if (ref) {
      lines.push(ref);
    } else {
      lines.push(`Unknown chart type: "${chartType}"`);
      lines.push(`Available types: ${CHART_TYPES.join(', ')}\n`);
      lines.push('Use QtCharts without arguments to see all chart types.');
    }
    return lines.join('\n');
  }

  // Overview of all chart types
  lines.push('### Chart Types');
  lines.push('');
  lines.push('| Type | Class | Best For |');
  lines.push('|------|-------|----------|');
  lines.push('| Line | `QLineSeries` | Time series, trends |');
  lines.push('| Spline | `QSplineSeries` | Smooth curves |');
  lines.push('| Scatter | `QScatterSeries` | Correlation plots |');
  lines.push('| Bar | `QBarSeries` / `QStackedBarSeries` | Categorical comparison |');
  lines.push('| Horizontal Bar | `QHorizontalBarSeries` | Long category labels |');
  lines.push('| Pie | `QPieSeries` | Proportional data (few categories) |');
  lines.push('| Area | `QAreaSeries` | Cumulative data, ranges |');
  lines.push('| Candlestick | `QCandlestickSeries` | Financial OHLC data |');
  lines.push('| Box Plot | `QBoxPlotSeries` | Statistical distribution |');
  lines.push('| Polar | `QPolarChart` + radial series | Circular data |');
  lines.push('');

  lines.push('### Quick Start (minimal chart)');
  lines.push('```cpp');
  lines.push('#include <QtCharts>');
  lines.push('');
  lines.push('QLineSeries *series = new QLineSeries();');
  lines.push('series->append(0, 6);');
  lines.push('series->append(2, 4);');
  lines.push('series->append(4, 8);');
  lines.push('');
  lines.push('QChart *chart = new QChart();');
  lines.push('chart->addSeries(series);');
  lines.push('chart->createDefaultAxes();');
  lines.push('chart->setTitle("My Chart");');
  lines.push('');
  lines.push('QChartView *view = new QChartView(chart);');
  lines.push('view->setRenderHint(QPainter::Antialiasing);');
  lines.push('view->show();');
  lines.push('```');
  lines.push('');

  lines.push('### Common Patterns\n');
  lines.push('**Live updating chart:**');
  lines.push('```cpp');
  lines.push('// Use QXYSeries::replace() for efficient updates');
  lines.push('void updateChart(QLineSeries *s, const QVector<QPointF> &pts) {');
  lines.push('    s->replace(pts);  // Single repaint, faster than clear()+append loop');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('**Multi-axis chart:**');
  lines.push('```cpp');
  lines.push('chart->addSeries(series1);');
  lines.push('chart->createDefaultAxes();  // Creates axis for series1');
  lines.push('chart->addSeries(series2);');
  lines.push('QValueAxis *axisY2 = new QValueAxis();');
  lines.push('chart->addAxis(axisY2, Qt::AlignRight);');
  lines.push('series2->attachAxis(axisY2);');
  lines.push('```');
  lines.push('');
  lines.push('**Chart in .ui file (promote QGraphicsView):**');
  lines.push('```cpp');
  lines.push('// 1. Add QGraphicsView to .ui, promote to QChartView');
  lines.push('// 2. In widget constructor:');
  lines.push('QChart *chart = new QChart();');
  lines.push('ui->chartView->setChart(chart);');
  lines.push('```');
  lines.push('');

  lines.push('### Anti-Patterns to Avoid');
  lines.push('- `clear()` then `append()` in a loop → use `replace()` for single update');
  lines.push('- Calling `createDefaultAxes()` after `addSeries()` for every series → call once after adding all');
  lines.push('- Not setting `chart->legend()->setVisible(false)` for single-series charts');
  lines.push('- `chart->removeAllSeries()` followed by `addSeries()` → use `removeSeries()` selectively');
  lines.push('- Using QPieSeries for >8 categories (becomes unreadable)');
  lines.push('- Not calling `series->setPointsVisible()` for small scatter datasets');
  lines.push('');
  lines.push(`Use \`QtCharts <type>\` for detailed reference on a specific chart type.`);

  return lines.join('\n');
}

function getChartReference(type: string): string | null {
  const refs: Record<string, string> = {
    line: `### QLineSeries
**Import**: \`#include <QLineSeries>\` | **Module**: \`QT += charts\`

\`\`\`cpp
QLineSeries *series = new QLineSeries();
series->setName("Temperature");
series->setColor(Qt::red);
series->setPen(QPen(Qt::red, 2));

// Data: append points
series->append(QPointF(0, 10));
series->append(QPointF(1, 15));
series->append(QPointF(2, 12));

// Or replace all at once (faster for updates)
QVector<QPointF> points = {{0,10},{1,15},{2,12}};
series->replace(points);

// Styling
series->setPointsVisible(true);  // Show data points
series->setPointLabelsVisible(true);  // Show values
series->setUseOpenGL(true);  // Hardware acceleration for large datasets
\`\`\`

**Key methods**: \`append()\`, \`replace()\`, \`pointsVector()\`, \`removePoints()\`, \`setPointLabelsFormat()\``,

    scatter: `### QScatterSeries
**Import**: \`#include <QScatterSeries>\`

\`\`\`cpp
QScatterSeries *series = new QScatterSeries();
series->setMarkerSize(10.0);
series->setMarkerShape(QScatterSeries::MarkerShapeCircle);
series->setBorderColor(Qt::black);

series->append(1, 5);
series->append(3, 7);
series->append(5, 3);
\`\`\`

**Marker shapes**: \`MarkerShapeCircle\`, \`MarkerShapeRectangle\`, \`MarkerShapeRotatedRectangle\`, \`MarkerShapeTriangle\`, \`MarkerShapeStar\`, \`MarkerShapePentagon\``,

    bar: `### QBarSeries / QBarSet
**Import**: \`#include <QBarSeries>\`, \`#include <QBarSet>\`

\`\`\`cpp
QBarSet *set0 = new QBarSet("Apples");
*set0 << 5 << 3 << 7 << 2;

QBarSet *set1 = new QBarSet("Oranges");
*set1 << 2 << 4 << 6 << 3;

QBarSeries *series = new QBarSeries();
series->append(set0);
series->append(set1);
series->setLabelsVisible(true);
series->setLabelsPosition(QAbstractBarSeries::LabelsInsideEnd);

QChart *chart = new QChart();
chart->addSeries(series);

QBarCategoryAxis *axisX = new QBarCategoryAxis();
axisX->append({"Q1", "Q2", "Q3", "Q4"});
chart->addAxis(axisX, Qt::AlignBottom);
series->attachAxis(axisX);
\`\`\`

**Variants**: \`QStackedBarSeries\`, \`QPercentBarSeries\`, \`QHorizontalBarSeries\`, \`QHorizontalStackedBarSeries\``,

    pie: `### QPieSeries
**Import**: \`#include <QPieSeries>\`

\`\`\`cpp
QPieSeries *series = new QPieSeries();
series->append("Category A", 30);
series->append("Category B", 45);
series->append("Category C", 25);

// Explode a slice
QPieSlice *slice = series->slices().at(0);
slice->setExploded(true);
slice->setLabelVisible(true);
slice->setColor(QColor("#FF6B6B"));

// Hole size for donut chart
series->setHoleSize(0.35);  // 35% hole = donut chart
series->setPieSize(0.7);     // 70% of available space
\`\`\`

**Best for**: ≤8 categories. For more, consider bar or treemap.`,

    financial: `### QCandlestickSeries / QBoxPlotSeries

**Candlestick (financial OHLC):**
\`\`\`cpp
QCandlestickSet *set = new QCandlestickSet(/*open*/100, /*high*/110, /*low*/95, /*close*/105);
QCandlestickSeries *series = new QCandlestickSeries();
series->setName("AAPL");
series->setIncreasingColor(Qt::green);
series->setDecreasingColor(Qt::red);
series->append(set);
\`\`\`

**Box Plot (statistical):**
\`\`\`cpp
QBoxPlotSeries *series = new QBoxPlotSeries();
QBoxSet *set = new QBoxSet(/*lower*/2, /*q1*/5, /*median*/8, /*q3*/12, /*upper*/15);
series->append(set);
\`\`\``,
  };

  return refs[type] || null;
}

const CHART_TYPES = ['line', 'scatter', 'bar', 'pie', 'spline', 'area', 'candlestick', 'boxplot', 'polar', 'financial'];
