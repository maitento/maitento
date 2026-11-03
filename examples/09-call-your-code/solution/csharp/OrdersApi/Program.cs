// Tutorial 9's orders API with the challenge's tracking endpoint, for the agent's track-order tool.
using System.Security.Cryptography;
using System.Text;

var apiKey = Environment.GetEnvironmentVariable("ORDERS_API_KEY")
    ?? throw new InvalidOperationException("Set ORDERS_API_KEY to the value you stored in the orders-api-key secret.");

// Each shop has its own key, and sees only its own orders. Shop 2 is for the end of tutorial 9: setting
// SECOND_SHOP_API_KEY opens it.
var shopKeys = new Dictionary<string, string> { ["shop-1"] = apiKey };
if (Environment.GetEnvironmentVariable("SECOND_SHOP_API_KEY") is { Length: > 0 } secondShopKey)
    shopKeys["shop-2"] = secondShopKey;

var orders = new Dictionary<string, Order>
{
    ["A-1001"] = new("A-1001", "shop-1", "Sam Lee", ["Blue mug", "Tea sampler"], 34.5m, "GBP", "delivered"),
    ["A-1002"] = new("A-1002", "shop-1", "Ana Silva", ["Desk lamp"], 59.9m, "GBP", "in transit"),
    ["B-2001"] = new("B-2001", "shop-2", "Kai Moreno", ["Oak bookshelf"], 189m, "EUR", "in transit"),
};

// Where each shipped order is. The challenge's new data.
var today = DateOnly.FromDateTime(DateTime.UtcNow);
var tracking = new Dictionary<string, Parcel>
{
    ["A-1002"] = new("DPD", "15502938476154", today.AddDays(2)),
    ["B-2001"] = new("DHL", "JD014600006281935", today.AddDays(4)),
};

// The shop whose key a call sends in X-Api-Key, compared in constant time so it can't be guessed from timing.
string? ShopFor(string sentKey)
{
    var sent = Encoding.UTF8.GetBytes(sentKey);
    foreach (var (shop, key) in shopKeys)
        if (CryptographicOperations.FixedTimeEquals(sent, Encoding.UTF8.GetBytes(key)))
            return shop;
    return null;
}

// The order, if it exists and belongs to the shop that asks.
Order? FindOrder(string orderId, string shop) =>
    orders.TryGetValue(orderId, out var order) && order.Shop == shop ? order : null;

var app = WebApplication.Create(args);

// Maitento sends the secret's value in the X-Api-Key header. Anything else is turned away.
app.Use(async (context, next) =>
{
    var shop = ShopFor(context.Request.Headers["X-Api-Key"].ToString());
    if (shop == null)
    {
        Console.WriteLine("401: a call without a known X-Api-Key");
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Unauthorised" });
        return;
    }
    context.Items["shop"] = shop;
    await next();
});

app.MapGet("/orders/{orderId}", (string orderId, HttpContext context) =>
{
    var shop = (string)context.Items["shop"]!;
    Console.WriteLine($"{shop}: GET /orders/{orderId}");
    return FindOrder(orderId, shop) is { } order
        ? Results.Ok(order)
        : Results.NotFound(new { error = $"There is no order {orderId}" });
});

// The challenge's new endpoint.
app.MapGet("/orders/{orderId}/tracking", (string orderId, HttpContext context) =>
{
    var shop = (string)context.Items["shop"]!;
    Console.WriteLine($"{shop}: GET /orders/{orderId}/tracking");
    return FindOrder(orderId, shop) is { } order && tracking.TryGetValue(order.Id, out var parcel)
        ? Results.Ok(new { orderId, parcel.Carrier, parcel.TrackingNumber, parcel.EstimatedDelivery })
        : Results.NotFound(new { error = $"There is no tracking for order {orderId}" });
});

app.MapPost("/orders/{orderId}/refund", (string orderId, RefundRequest refund, HttpContext context) =>
{
    var shop = (string)context.Items["shop"]!;
    Console.WriteLine($"{shop}: POST /orders/{orderId}/refund");
    if (FindOrder(orderId, shop) is not { } order)
        return Results.NotFound(new { error = $"There is no order {orderId}" });

    var refundable = order.Total - order.Refunded;
    if (refund.Amount <= 0 || refund.Amount > refundable)
        return Results.BadRequest(new { error = $"You can refund between 0.01 and {refundable:0.00} {order.Currency}" });

    order.Refunded += refund.Amount;
    Console.WriteLine($"Refunded {refund.Amount} {order.Currency} on {orderId}: {refund.Reason}");
    return Results.Ok(new { orderId, refunded = refund.Amount, totalRefunded = order.Refunded });
});

app.Run($"http://localhost:{Environment.GetEnvironmentVariable("PORT") ?? "3000"}");

record Order(string Id, string Shop, string Customer, string[] Items, decimal Total, string Currency, string Status)
{
    public decimal Refunded { get; set; }
}

record RefundRequest(decimal Amount, string Reason);

record Parcel(string Carrier, string TrackingNumber, DateOnly EstimatedDelivery);
