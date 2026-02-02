let hourlyChartInstance = null;

function renderHourlyChart(hourlySales = []) {
  const ctx = document.getElementById("hourlyChart").getContext("2d");

  if (hourlyChartInstance) {
    hourlyChartInstance.destroy();
  }

  const theme = getChartTheme();
  const brandColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--brand-primary")
      .trim() || "#519cff";

  const hours = Array.from({ length: 24 }, (_, i) =>
    i.toString().padStart(2, "0") + ":00"
  );

  hourlyChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: hours,
      datasets: [
        {
          label: "Sales (Rs)",
          data: hourlySales.length ? hourlySales : new Array(24).fill(0),
          borderColor: brandColor,
          backgroundColor: brandColor + "33",
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: brandColor,
          pointBorderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          borderWidth: 1,
          borderColor: theme.gridColor,
          padding: 10,
          callbacks: {
            label: (ctx) => ` Rs ${ctx.parsed.y.toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: theme.gridColor
          },
          ticks: {
            color: theme.textColor,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          }
        },
        y: {
          grid: {
            color: theme.gridColor
          },
          ticks: {
            color: theme.textColor,
            callback: (v) => "Rs " + v
          }
        }
      }
    }
  });
}
