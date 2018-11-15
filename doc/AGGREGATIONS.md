# Aggregations

Aggregations can currently be added to the base model (not onto eagerly loaded models).

The functions _count, sum, min, max, avg_ are supported, along with a _distinct_ flag.

The aggregated field eg `count` will appear as if it is a column of the root model.

### Basic examples

A base customer model may look something like this:
```json
{
  "firstName": "John",
  "lastName": "Smith"
}
```

To get the number of _orders_ per _Customer_, where _Customer_ hasMany _Order_
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "alias": "numberOfOrders",
          "relation": "orders"
        }
    ]
  }
}
```

This would yield results which look like:
```json
[
  {
    "firstName": "John",
    "lastName": "Smith",
    "numberOfOrders": 23
  }
]
```

To get the number of unique _products_ in an _order_ per _Customer_, where _Order_ hasMany _Item_ belongsTo _Product_
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "distinct": true,
          "alias": "numberOfUniquelyOrderedProducts",
          "relation": "orders.items.product"
        }
    ]
  }
}
```

### Filtering

Filtering for aggregations is done at the _Outer Most_ model. Given a set of models:

* _Customer_ hasMany _Order_ hasMany _item_ belongsTo _Product_

To query the _number of times a customer has ordered Apples_, the query would look like:
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "alias": "numberOfAppleOrders",
          "relation": "orders.items",
          "$where": {
            "product.name": "Apple"
          }
        }
    ]
  }
}
```

In the aggregation's `$where` - the expression `product.name` is a relation of the outer most model (`Item`) not the root model (`Customer`).

To summarize the query above:

* We are querying the `Customer` model
* We are creating an aggregation `numberOfAppleOrders` based on a relation `orders.items`
* `orders.items` is a relation relative to the `Customer` model, which corresponds to the `Item` model
* We are filtering the aggregation to only count items which are _Apples_
* From the `Item` model, we use `$where` to filter a relation `product.name`
* `product.name` is a field relative to the `Item` model

### Other aggregation types
To query the _total number of Apples ordered by a customer_, the query would look like:
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "sum",
          "alias": "numberOfApplesOrdered",
          "field": "quantity",
          "relation": "orders.items",
          "$where": {
            "product.name": "Apple"
          }
        }
    ]
  }
}
```

In the above example, the `field` attribute is specified. The `field` is also relative to the outer most model (eg `quantity` is a column of the `Item` model).

### Multiple aggregations
Aggregations can be combined in the same query. Any aggregations should be provided as an array:
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "alias": "numberOfOrders",
          "relation": "orders"
        },
        {
          "type": "sum",
          "alias": "numberOfOrderedItems",
          "relation": "orders.items",
          "field": "quantity"
        }
    ]
  }
}
```


### Filtering results based on aggregations
Sometimes you'll want to get a model, but filter it based on the result of aggregations.

An example is you have a _Customer_ model, with an aggregation on each customer _numberOfOrders_. You can filter these results to only show _customers with more than 10 orders_.

```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "alias": "numberOfOrders",
          "relation": "orders"
        }
    ],
    "$where": {
      "numberOfOrders": { "$gt": 10 }
    }
  }
}
```

### Ordering results based on aggregations
Sometimes you'll want to aggregate based on a model, but only get the top 10 results ordered by the same aggregated field.

An example is you have a _Customer_ model, with an aggregation on each customer _numberOfOrders_. You want to show the top 10 customers based on the orders.

```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "alias": "numberOfOrders",
          "relation": "orders"
        }
    ]
  },
  "order": "numberOfOrders desc",
  "limit": 10
}
```

> A warning on performance: Whenever you order based on an aggregation, the result will be slower (sometimes significantly). The only way to know the order is to aggregate on every row in the root table. If you have a lot of rows, it's going to be slow and is unavoidable. If you need performant aggregation, look into materialized views or other strategies.

### Another method of aggregation filtering
A common problem with querying in general, is limiting views into data. This is often for security reasons, eg slicing data based on tenant.

This is a problem that can occur during eager loading, but also aggregation. Take the following as an example, for a multi-tenant Shop management platform:

_Tenant_ hasMany _Shop_ belongsTo _ShopType_

In the above example, _ShopType_ is global to the application. It could be a list of items such as [Restaurant, Retail, Service]. When a tenant goes to query their shops, you'll want to filter the list so they only see _their own_ shops. This can be done in objection.js using the [onBuild hook](https://vincit.github.io/objection.js/#onbuild):

```js
function sliceByTenant = tenantId => builder => {
  if (builder.modelClass().name === 'Shop')
    builder.where({ tenantId });
};

// Route handler for GET /Shops
async function getShops(req) {
  const { tenantId } = req.decoded; // Using some express middleware
  return await buildFilter(Shop)
    .build(req.query)
    .onBuild(sliceByTenant(tenantId));
};

// Route handler for GET /ShopTypes
async function getShopTypes(req) {
  const { tenantId } = req.decoded; // Using some express middleware
  return await buildFilter(ShopType)
    .build(req.query)
    .onBuild(sliceByTenant(tenantId));
};
```

Based on the expressjs route handlers above, a user could call `GET /Shops` to get their list of shops.

They could also call `GET /ShopTypes?filter={"eager": "shops"}` to get all ShopTypes then eagerly load their shops. The `sliceByTenant()` build hook ensures that they only see the shops that they own.

##### Aggregation model hooks

The same thing can be applied for aggregations. We don't want anyone doing `GET /ShopTypes` and getting a count of _all_ shops, but only their own shops. To do this, the `onAggBuild` hook can be used. This hook is called every time a model is _joined through_. For the [onBuild hook](https://vincit.github.io/objection.js/#onbuild), it is called once when a _query is built_.

```js
const createOnAggBuild = tenantId => Model => {
  if (Model.name === 'Shop')
    builder.where({ tenantId });
};

// Route handler for GET /ShopTypes
async function getShopTypes(req) {
  const { tenantId } = req.decoded; // Using some express middleware
  return await buildFilter(ShopType, null, { onAggBuild: createOnAggBuild(tenantId) })
    .build(req.query)
    .onBuild(sliceByTenant(tenantId));
};
```

Now a query such as:
```
GET /ShopTypes?filter={
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "alias": "shopCount",
          "relation": "shops"
        }
    ]
  }
}
```
will only show counts for the target `tenantId`.