# A tiny orders API. Maitento calls it for the agent's get-order tool, and for refund-order in tutorial 10.
# Run it with: uvicorn server:app --port 3000
import hmac
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

API_KEY = os.environ.get("ORDERS_API_KEY")
if not API_KEY:
    raise RuntimeError("Set ORDERS_API_KEY to the value you stored in the orders-api-key secret.")

# Each shop has its own key, and sees only its own orders. Shop 2 is for the end of tutorial 9: setting
# SECOND_SHOP_API_KEY opens it.
SHOP_KEYS = {"shop-1": API_KEY}
if os.environ.get("SECOND_SHOP_API_KEY"):
    SHOP_KEYS["shop-2"] = os.environ["SECOND_SHOP_API_KEY"]

orders = {
    "A-1001": {"id": "A-1001", "shop": "shop-1", "customer": "Sam Lee", "items": ["Blue mug", "Tea sampler"],
               "total": 34.5, "currency": "GBP", "status": "delivered", "refunded": 0.0},
    "A-1002": {"id": "A-1002", "shop": "shop-1", "customer": "Ana Silva", "items": ["Desk lamp"],
               "total": 59.9, "currency": "GBP", "status": "in transit", "refunded": 0.0},
    "B-2001": {"id": "B-2001", "shop": "shop-2", "customer": "Kai Moreno", "items": ["Oak bookshelf"],
               "total": 189.0, "currency": "EUR", "status": "in transit", "refunded": 0.0},
}

app = FastAPI()


def shop_for(sent_key: str) -> str | None:
    """The shop whose key a call sends in X-Api-Key, compared in constant time so it can't be guessed from timing."""
    for shop, key in SHOP_KEYS.items():
        if hmac.compare_digest(sent_key, key):
            return shop
    return None


# Maitento sends the secret's value in the X-Api-Key header. Anything else is turned away.
@app.middleware("http")
async def check_api_key(request: Request, call_next):
    shop = shop_for(request.headers.get("X-Api-Key", ""))
    if shop is None:
        print("401: a call without a known X-Api-Key")
        return JSONResponse({"error": "Unauthorised"}, status_code=401)
    request.state.shop = shop
    return await call_next(request)


def find_order(order_id: str, shop: str) -> dict:
    """The order, if it exists and belongs to the shop that asks."""
    order = orders.get(order_id)
    if order is None or order["shop"] != shop:
        raise HTTPException(404, f"There is no order {order_id}")
    return order


@app.get("/orders/{order_id}")
def get_order(order_id: str, request: Request):
    print(f"{request.state.shop}: GET /orders/{order_id}")
    return find_order(order_id, request.state.shop)


class Refund(BaseModel):
    amount: float
    reason: str


@app.post("/orders/{order_id}/refund")
def refund_order(order_id: str, refund: Refund, request: Request):
    print(f"{request.state.shop}: POST /orders/{order_id}/refund")
    order = find_order(order_id, request.state.shop)
    refundable = order["total"] - order["refunded"]
    if refund.amount <= 0 or refund.amount > refundable:
        raise HTTPException(400, f"You can refund between 0.01 and {refundable:.2f} {order['currency']}")
    order["refunded"] += refund.amount
    print(f"Refunded {refund.amount} {order['currency']} on {order_id}: {refund.reason}")
    return {"orderId": order_id, "refunded": refund.amount, "totalRefunded": order["refunded"]}
