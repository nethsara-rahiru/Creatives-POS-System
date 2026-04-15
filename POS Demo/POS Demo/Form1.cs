using Microsoft.Web.WebView2.Core;
using System;
using System.Collections.Generic;
using System.Data;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace POS_Demo
{
    public partial class Form1 : Form
    {
        string[] CurrentUserPermissions;
        string nextPage = "";

        public Form1()
        {
            InitializeComponent();
        }

        private async void Form1_Load(object sender, EventArgs e)
        {
            this.WindowState = FormWindowState.Maximized;

            // Initialize WebView2
            await webView21.EnsureCoreWebView2Async(null);

            string htmlPath = @"D:\Demo POS System\index.html";

            if (!File.Exists(htmlPath))
            {
                MessageBox.Show("HTML file not found:\n" + htmlPath);
                return;
            }

            // Subscribe to messages from JS
            webView21.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

            // Load HTML
            webView21.Source = new Uri(htmlPath);
        }

        private async void CoreWebView2_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            // Get message JSON from JS
            string msgJson = e.WebMessageAsJson;

            // JS notifies C# that page is ready
            if (msgJson.Contains("JS_READY"))
            {
                // Timer can safely run now
                //timer1.Start();
            }
            else if (msgJson.Contains("DASHBOARD"))
            {
                if (CurrentUserPermissions == null || CurrentUserPermissions.Length == 0)
                    return;

                // Convert C# array → JSON
                string permissionsJson = JsonSerializer.Serialize(CurrentUserPermissions);

                // Pass valid JS array
                webView21.ExecuteScriptAsync(
                    $"setPermission({permissionsJson});"
                );
            }
            else if (msgJson.Contains("#BILL_SAVED_ONLINE"))
            {
                using (JsonDocument doc = JsonDocument.Parse(msgJson))
                {
                    JsonElement root = doc.RootElement;

                    // ✅ Safe property access
                    if (!root.TryGetProperty("billId", out JsonElement billIdEl) ||
                        !root.TryGetProperty("firestoreDocId", out JsonElement docIdEl))
                        return;

                    string billId = billIdEl.GetString();
                    string firestoreDocId = docIdEl.GetString();

                    if (string.IsNullOrWhiteSpace(billId) ||
                        string.IsNullOrWhiteSpace(firestoreDocId))
                        return;

                    Database.UpdateStatus(billId, firestoreDocId);
                }
            }
            else if (msgJson.Contains("#BUSINESS_PERMISSION"))
            {
                using (JsonDocument doc = JsonDocument.Parse(msgJson))
                {
                    JsonElement root = doc.RootElement;

                    // 1️⃣ Read permission array
                    JsonElement permissionElement = root.GetProperty("permission");

                    // 2️⃣ Convert JSON array → C# string[]
                    string[] permissions = JsonSerializer.Deserialize<string[]>(
                        permissionElement.GetRawText()
                    );

                    // 4️⃣ Store globally (recommended)
                    CurrentUserPermissions = permissions;

                    if (CurrentUserPermissions.Length == 1)
                    {
                        nextPage = CurrentUserPermissions[0];
                    }
                    else
                    {
                        nextPage = "dashboard";
                    }

                    webView21.ExecuteScriptAsync($"loadPage('{nextPage}')");
                }
            }

            else if (msgJson.Contains("#BUSINESS_OK"))
            {
                // Parse JSON manually
                dynamic data = System.Text.Json.JsonSerializer.Deserialize<dynamic>(msgJson);

                string businessID = data.GetProperty("businessID").GetString();
                string name = data.GetProperty("name").GetString();
                string category = data.GetProperty("category").GetString();
                string logoLink = data.GetProperty("logoLink").GetString();

                /*
                // Saving Logo
                string downloadLocation = @"D:\test";
                string fileName = name + "-logo.png";
                string filePath = Path.Combine(downloadLocation, fileName);

                Directory.CreateDirectory(downloadLocation);

                using (WebClient wc = new WebClient())
                {
                    wc.DownloadFile(logoLink, downloadLocation);
                }
                MessageBox.Show("Image Saved");
                
                using (HttpClient c = new HttpClient())
                {
                    byte[] imageBytes = await c.GetByteArrayAsync(logoLink);
                    await File.WriteAllBytesAsyn(downloadLocation, imageBytes);
                }
                */


                //MessageBox.Show($"Welcome {name}!\nBusiness ID: {businessID}\nCategory: {category}");
            }
            else if (msgJson.Contains("#PRINT_RECEIPT"))
            {
                var json = e.WebMessageAsJson;
                var msg = JsonDocument.Parse(json).RootElement;

                var receipt = msg.GetProperty("receipt").GetRawText();
                await PrintReceiptAsync(receipt);
            }
            else
            {
                using (JsonDocument doc = JsonDocument.Parse(msgJson))
                {
                    JsonElement root = doc.RootElement;

                    if (!root.TryGetProperty("type", out JsonElement typeEl))
                        return;

                    string type = typeEl.GetString();

                    if (type == "#BUSINESS_TRADEMARK")
                    {
                        JsonElement trademark = root.GetProperty("trademark");
                        Database.SaveTrademarkToSQLite(trademark);
                    }
                }
            }
            
        }

        private void timer1_Tick(object sender, EventArgs e)
        {
            timer1.Stop();

            if (!Database.ProfilesTableExists())
            {
                // Ask JS to show username input
                webView21.ExecuteScriptAsync("getUsername();");
            }
            else
            {
                // Send profiles JSON to JS
                string json = Database.DataTableToJson(Database.GetProfiles());
                webView21.ExecuteScriptAsync($"showProfiles({json});");
            }
        }



        private void PrintPdfSilently(string pdfPath)
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "msedge.exe",
                Arguments = $"--kiosk-printing \"{pdfPath}\"",
                CreateNoWindow = true,
                WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                UseShellExecute = true
            };

            System.Diagnostics.Process.Start(psi);
        }
        private async Task PrintReceiptAsync(string receiptJson)
        {
            var receipt = JsonDocument.Parse(receiptJson).RootElement;
            string html = BuildReceiptHtml(receipt);

            await PrintHtmlSilentlyAsync(html);

            Database.SaveOfflineBill(receipt);
        }

        private async Task PrintHtmlSilentlyAsync(string html)
        {
            var printView = new Microsoft.Web.WebView2.WinForms.WebView2
            {
                Visible = false,
                Size = new Size(1, 1)
            };

            this.Controls.Add(printView);

            await printView.EnsureCoreWebView2Async(null);

            printView.NavigateToString(html);

            await Task.Delay(500); // allow render

            var settings = printView.CoreWebView2.Environment.CreatePrintSettings();
            settings.ShouldPrintBackgrounds = true;
            settings.ShouldPrintHeaderAndFooter = false;
            settings.ScaleFactor = 1.0; // no scaling

            // remove margins
            settings.MarginTop = 0;
            settings.MarginBottom= 0;
            settings.MarginLeft = 0;
            settings.MarginRight = 0;

            // SILENT PRINT
            await printView.CoreWebView2.PrintAsync(settings);

            // CLEANUP
            this.Controls.Remove(printView);
            printView.Dispose();
        }



        private string BuildReceiptHtml(JsonElement r)
        {
            // Extract main receipt info
            string storeName = r.TryGetProperty("storeName", out var v1) ? v1.GetString() : "STORE";
            string date = r.TryGetProperty("date", out var v2) ? v2.GetString() : "";
            string cashier = r.TryGetProperty("cashier", out var v3) ? v3.GetString() : "";
            string paymentType = r.TryGetProperty("paymentType", out var v4) ? v4.GetString() : "";
            decimal total = r.TryGetProperty("total", out var v5) ? v5.GetDecimal() : 0;

            decimal totalDiscount = 0; // total discount accumulator
            var itemsHtml = "";

            // Build table rows
            if (r.TryGetProperty("items", out JsonElement items))
            {
                foreach (var item in items.EnumerateArray())
                {
                    string name = item.GetProperty("name").GetString();
                    int qty = item.GetProperty("quantity").GetInt32();
                    decimal price = item.GetProperty("unitPrice").GetDecimal();
                    decimal discount = item.TryGetProperty("discount", out var vdisc) ? vdisc.GetDecimal() : 0;
                    decimal subtotal = item.GetProperty("subtotal").GetDecimal();

                    totalDiscount += discount;

                    itemsHtml += $@"
        <tr class='item'>
            <td class='name'>{name}</td>
            <td class='unit'>{price:0.00}</td>
            <td class='qty'>{qty}</td>
            <td class='price'>
                {subtotal:0.00}" +
                        (discount > 0 ? $"<br>( - {discount:0.00} )" : "") +
                    @"</td>
        </tr>";
                }
            }

            // Build discount HTML only if applicable
            string discountHtml = totalDiscount > 0 ? $@"
        <div class='discount-line'>
            <span>Total Discount</span>
            <span>Rs {totalDiscount:0.00}</span>
        </div>" : "";

            // Return full HTML
            return $@"
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset='UTF-8'>
        <style>
        * {{ box-sizing: border-box; }}
        body {{
            margin:0; 
            padding:0; 
            font-family: system-ui; 
            font-size: 14px;
            width:100%;
        }}
        .header {{
            text-align:center;
            margin-bottom:6px;
        }}
        .header h1 {{ font-size:18px; margin:0; letter-spacing:1px; }}
        .header .sub {{ font-size:11px; }}
        .hr {{ border-top:1px dashed #000; margin:6px 0; }}
        .meta {{ font-size:11px; }}
        table {{ width:100%; border-collapse:collapse; }}
        th, td {{ padding:4px 0; font-size:12px; }}
        th {{ border-bottom:1px dashed #000; text-align:left; }}
        .item td {{ padding:2px 0; }}
        .name {{ width:40%; }}
        .unit {{ width:20%; text-align:right; }}
        .qty {{ width:15%; text-align:center; }}
        .price {{ width:25%; text-align:right; }}
        .total-box {{ margin-top:6px; padding-top:6px; border-top:2px solid #000; font-weight:bold; font-size:16px; }}
        .total-line {{ display:flex; justify-content:space-between; }}
        .discount-line {{ display:flex; justify-content:space-between; font-size:14px; margin-top:4px; }}
        .footer {{ text-align:center; font-size:11px; margin-top:8px; }}
        .footer .thanks {{ font-weight:bold; margin-top:4px; }}
        @media print {{
            body {{ width:100%; margin:0; padding:0; }}
            table {{ width:100%; }}
        }}
        </style>
        </head>

        <body>
        <div class='header'>
            <h1>{storeName}</h1>
            <div class='sub'>OFFICIAL RECEIPT</div>
        </div>

        <div class='hr'></div>

        <div class='meta'>
            Date: {date}<br>
            Cashier: {cashier}
        </div>

        <div class='hr'></div>

        <table>
        <tr>
            <th>Item</th>
            <th style='text-align:right'>U.Price</th>
            <th style='text-align:center'>Qty</th>
            <th style='text-align:right'>Amount</th>
        </tr>
        {itemsHtml}
        </table>

        {discountHtml}

        <div class='total-box'>
            <div class='total-line'>
                <span>TOTAL</span>
                <span>Rs {total:0.00}</span>
            </div>
        </div>

        <div class='footer'>
            Powered By Creatives<br>
            <div class='thanks'>THANK YOU — VISIT AGAIN!</div>
        </div>
        </body>
        </html>";
        }







    }
}
