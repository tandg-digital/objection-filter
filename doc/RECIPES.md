# Recipes

Here are some example queries to perform common operations.

##### Only show me customers where their country contains "Fr"
For models _Customer_ belongsTo _City_ belongsTo _Country_
```json
{
  "eager": {
    "$where": {
      "cities.countries.name": {
        "$like": "Fr"
      }
    }
  }
}
```

This will result in a dataset like the following
```json
[
  {
    "id": 123,
    "firstName": "John",
    "lastName": "Smith"
  }
]
```

The `require` attribute will not automatically include related models. This allows for filtering based properties of some related models.

The `eager` attribute can be include a different set of relations and the `$where` modifier can be used to filter each model.

##### Show me customers with a last name "Smith" but only show me their orders which are complete
For models _Customer_ hasMany _Order_
```json
{
  "eager": {
    "$where": {
      "lastName": "Smith"
    },
    "orders": {
      "$where": {
        "status": "COMPLETE"
      }
    }
  }
}
```

This will result in a dataset like the following
```json
[
  {
    "id": 123,
    "firstName": "John",
    "lastName": "Smith",
    "orders": [{"id": 1, "status": "COMPLETE"}]
  },
  {
    "id": 234,
    "firstName": "Jane",
    "lastName": "Smith",
    "orders: [] // Still shows the customer even though no orders exist that are complete
  }
]
```

##### Show me customers from Australia, and for each of those customers include their favorites which they ranked 3 stars or above
For models:
  * _Customer_ belongsTo _City_ belongsTo _Country_
  * _Customer_ hasMany _favorites_
```json
{
  "eager": {
    "$where": {
      "cities.countries.name": "Australia"
    },
    "favorites": {
      "$where": {
        "starRanking": { "$gte": 3 }
      }
    }
  }
}
```

This will result in a dataset like the following
```json
[
  {
    "id": 123,
    "firstName": "John",
    "lastName": "Smith",
    "favorites": [{ "id": 103, "starRanking": 5, "productId": 123 }]
  },
  {
    "id": 234,
    "firstName": "Greg",
    "lastName": "Jones",
    "favorites": [{ "id": 343, "starRanking": 3, "productId": 54 }]
  }
]
```
