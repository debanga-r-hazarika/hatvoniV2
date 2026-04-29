# 2 SHIPMENT LOT COMBINATIONS

## 🟢 Delivery Outcomes

| Lot 1 | Lot 2 | Order Status |
| --- | --- | --- |
| delivered | delivered | **DELIVERED** |
| delivered | in\_transit | **PARTIALLY\_DELIVERED** |
| delivered | processing | **PARTIALLY\_DELIVERED** |
| delivered | out\_for\_delivery | **PARTIALLY\_DELIVERED** |

___

## 🔴 Failure / RTO

| Lot 1 | Lot 2 | Order Status |
| --- | --- | --- |
| delivered | rto\_delivered | **PARTIALLY\_FAILED** |
| delivered | cancelled | **PARTIALLY\_FAILED** |
| delivered | lost | **PARTIALLY\_FAILED** |
| rto\_delivered | rto\_delivered | **FAILED** |
| cancelled | cancelled | **FAILED** |

___

## 🟡 Return in Progress

| Lot 1 | Lot 2 | Order Status |
| --- | --- | --- |
| in\_transit | rto\_in\_transit | **PARTIALLY\_RETURNING** |
| delivered | rto\_initiated | **PARTIALLY\_RETURNING** |
| rto\_initiated | rto\_in\_transit | **PARTIALLY\_RETURNING** |

___

## 🔵 Active Shipping

| Lot 1 | Lot 2 | Order Status |
| --- | --- | --- |
| processing | in\_transit | **IN\_TRANSIT** |
| ready\_for\_pickup | in\_transit | **IN\_TRANSIT** |
| out\_for\_delivery | in\_transit | **IN\_TRANSIT** |

___

## 🟣 Exception Cases

| Lot 1 | Lot 2 | Order Status |
| --- | --- | --- |
| delivered | ndr\_raised | **ATTENTION\_REQUIRED** |
| in\_transit | need\_attention | **ATTENTION\_REQUIRED** |
| any | not\_picked | **ATTENTION\_REQUIRED** |

___

## ⚪ Pre-shipping

| Lot 1 | Lot 2 | Order Status |
| --- | --- | --- |
| processing | processing | **PROCESSING** |
| pending | processing | **PROCESSING** |

___

# 🚀 3 SHIPMENT LOT COMBINATIONS

## 🟢 All Same

| Lot Combination | Order Status |
| --- | --- |
| delivered + delivered + delivered | **DELIVERED** |
| in\_transit + in\_transit + in\_transit | **IN\_TRANSIT** |
| processing + processing + processing | **PROCESSING** |
| rto\_delivered + rto\_delivered + rto\_delivered | **FAILED** |

___

## ⚡ Partial Delivery

| Combination | Order Status |
| --- | --- |
| delivered + in\_transit + in\_transit | **PARTIALLY\_DELIVERED** |
| delivered + processing + processing | **PARTIALLY\_DELIVERED** |
| delivered + out\_for\_delivery + in\_transit | **PARTIALLY\_DELIVERED** |

___

## 🔴 Partial Failure

| Combination | Order Status |
| --- | --- |
| delivered + rto\_delivered + in\_transit | **PARTIALLY\_FAILED** |
| delivered + lost + in\_transit | **PARTIALLY\_FAILED** |
| delivered + cancelled + delivered | **PARTIALLY\_FAILED** |

___

## 🟡 Return in Progress

| Combination | Order Status |
| --- | --- |
| in\_transit + rto\_in\_transit + in\_transit | **PARTIALLY\_RETURNING** |
| delivered + rto\_initiated + in\_transit | **PARTIALLY\_RETURNING** |
| rto\_initiated + rto\_in\_transit + delivered | **PARTIALLY\_RETURNING** |

___

## 🟣 Exception / Attention

| Combination | Order Status |
| --- | --- |
| delivered + ndr\_raised + in\_transit | **ATTENTION\_REQUIRED** |
| in\_transit + need\_attention + processing | **ATTENTION\_REQUIRED** |
| any + any + not\_picked | **ATTENTION\_REQUIRED** |

___

## 🔶 Mixed Complex

| Combination | Order Status |
| --- | --- |
| delivered + in\_transit + rto\_initiated | **PARTIALLY\_COMPLETED** |
| delivered + processing + rto\_in\_transit | **PARTIALLY\_COMPLETED** |

___

# 🧠 Final Simplified Logic (What Actually Runs)

Instead of memorizing all tables:

### Rules:

1.  If ANY lot = issue → **ATTENTION\_REQUIRED**
    
2.  If mix of delivered + failed → **PARTIALLY\_FAILED**
    
3.  If any return flow → **PARTIALLY\_RETURNING**
    
4.  If at least one delivered → **PARTIALLY\_DELIVERED**
    
5.  If all moving → **IN\_TRANSIT**
    
6.  If all pre-shipping → **PROCESSING**
    
7.  If all delivered → **DELIVERED**
    
8.  If all failed → **FAILED**