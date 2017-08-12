# Filter Query Builder
objection-filter is a filtering module for the [objection.js](https://github.com/Vincit/objection.js) ORM. It was originally based on [objection-find](https://github.com/Vincit/objection-find), but has since moved in a different direction. It aims to fulfil some requirements that occur often during API development:

##### 1. Filtering on nested relations
For example, if you have the models _Customer_ belongsTo _City_ belongsTo _Country_, we can query all _Customers_ where the _Country_ starts with `A`.

This also means that row-based multi-tenancy or data slicing is easy, since the query is essentially "find me instances of `Model` where `path.to.tenantId = TENANT_ID`".

##### 2. Controlled exposure through a REST API
The benefit of having filters is exposing them through an API. ORMs usually provide powerful filtering which would not be suitable for public exposure. The filtering capability in this module is designed to be exposed rather than only used on the back-end.

# Installation

`npm i objection-filter --save`

# Usage

The filtering library can be applied onto every _findAll_ REST endpoint e.g. `GET /api/{Model}?filter={"limit": 1}`

A typical express route handler with a filter applied:
```
const { buildFilter } = require('objection-filter');
const { Customer } = require('./models');

app.get('/Customers', function(req, res, next) {
  buildFilter(Customer)
    .build(JSON.parse(req.query.filter))
    .then(customers => res.send(customers))
    .catch(next);
});
```

Available filter properties include:
```
// GET /api/Customers
{
  // Properties on eagerly loaded models to filter by, but still show all root models
  "where": { "id": 2 },
  // Properties on related models which are required to show the root model
  "require": { "relatedModel.parentModel.otherModel.name": "test" },
  // An objection.js eager expression
  "eager": "relatedModel",
  // An objection.js order by expression
  "order": "name desc",
  "limit": 10,
  "offset": 10,
  // An array of dot notation fields to select on the root model and eagerly loaded models
  "fields": ["id", "relatedModel.name"]
}
```

# Example queries

Here are some example queries to perform common operations.

#### Only show me customers where their country contains "Fr"
For models _Customer_ belongsTo _City_ belongsTo _Country_
```
{
  "require": {
    "cities.countries.name": {
      "$like": "Fr"
    }
  }
}
```

This will result in a dataset like the following
```
[
  {
    "id": 123,
    "firstName": "John",
    "lastName": "Smith"
  }
]
```

The `require` attribute will not automatically include related models. This allows for filtering based on one relation, but then using `eager` to include a different set of relations, and `where` to filter on those relations.

#### Show me customers with a last name "Smith" but only show me their orders which are complete
For models _Customer_ hasMany _Order_
```
{
  "where": {
    "lastName": "Smith",
    "orders.status": "COMPLETE"
  },
  "eager": "[orders]"
}
```

This will result in a dataset like the following
```
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

#### Filter Operators

There are a limited number of operations that can be used within the filter syntax. These include:

1. **$like** - The SQL _LIKE_ operator, can be used with expressions such as _ab%_ to search for strings that start with _ab_
2. **$gt/$lt/$gte/$lte** - Greater than and Less than operators for numerical fields
3. **=/$equals** - Explicitly specify equality
4. **$in** - Whether the target value is in an array of values
5. **$exists** - Whether a property is not null
6. **$or** - A top level _OR_ conditional operator

##### Example

An example of operator usage
```
{
  "where": {
    "property0": "Exactly Equals",
    "property1": {
      "$equals": 5
    },
    "property2": {
      "$gt": 5
    },
    "property3": {
      "$lt": 10,
      "$gt": 5
    },
    "property4": {
      "$in": [ 1, 2, 3 ]
    },
    "property5": {
      "$exists": false
    },
    "property6": {
      "$or": [
        { "$in": [ 1, 2, 3 ] },
        { "$equals": 100 }
      ]
    }
  }
}
```

All operators can be used with `where` to filter the root model or eagerly loaded models, or with `require` to filter the root model based on related models.