[![Build Status](https://travis-ci.org/tandg-digital/objection-filter.svg?branch=master)](https://travis-ci.org/tandg-digital/objection-filter) [![Coverage Status](https://coveralls.io/repos/github/tandg-digital/objection-filter/badge.svg?branch=master)](https://coveralls.io/github/tandg-digital/objection-filter?branch=master)

# objection-filter
objection-filter is a filtering module for the [objection.js](https://github.com/Vincit/objection.js) ORM. It was originally based on [objection-find](https://github.com/Vincit/objection-find), but has since moved in a different direction. It aims to fulfil some requirements that occur often during API development:

##### 1. Filtering on nested relations
For example, if you have the models _Customer_ belongsTo _City_ belongsTo _Country_, we can query all _Customers_ where the _Country_ starts with `A`.

##### 2. Eagerly loading data
Eagerly load a bunch of related data in a single query. This is useful for getting a list models e.g. _Customers_ then including all their _Orders_ in the same query.

# Shortcuts

* [Changelog](doc/CHANGELOG.md)
* [Recipes](doc/RECIPES.md)

# Installation

`npm i objection-filter --save`

> objection-filter >= 1.0.0 is fully backwards compatible with older queries, but now supports nested [and/or filtering](#logical-expressions) as well as the new objection.js object notation. The 1.0.0 denotation was used due to these changes and the range of query combinations possible.

# Usage

The filtering library can be applied onto every _findAll_ REST endpoint e.g. `GET /api/{Model}?filter={"limit": 1}`

A typical express route handler with a filter applied:
```js
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
```js
// GET /api/Customers
{
  // Filtering and eager loading
  "eager": {
    // Top level $where filters on the root model
    "$where": {
      "firstName": "John"
      "profile.isActivated": true,
      "city.country": { "$like": "A" }
    },
    // Nested $where filters on each related model
    "orders": {
      "$where": {
        "state.isComplete": true
      },
      "products": {
        "$where": {
          "category.name": { "$like": "A" }
        }
      }
    }
  },
  // An objection.js order by expression
  "order": "firstName desc",
  "limit": 10,
  "offset": 10,
  // An array of dot notation fields to select on the root model and eagerly loaded models
  "fields": ["firstName", "lastName", "orders.code", "products.name"]
}
```

> The `where` operator from < v1.0.0 is still available and can be combined with the `eager` string type notation. The same is applicable to the `require` operator. For filtering going forward, it's recommended to use the objection object-notation for eager loading along with `$where` definitions at each level.

# Filter Operators

There are a number of built-in operations that can be applied to columns (custom ones can also be created). These include:

1. **$like** - The SQL _LIKE_ operator, can be used with expressions such as _ab%_ to search for strings that start with _ab_
2. **$gt/$lt/$gte/$lte** - Greater than and Less than operators for numerical fields
3. **=/$equals** - Explicitly specify equality
4. **$in** - Whether the target value is in an array of values
5. **$exists** - Whether a property is not null
6. **$or** - A top level _OR_ conditional operator

##### Example

An example of operator usage
```json
{
  "eager": {
    "$where": {
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
}
```

# Logical Expressions
Logical expressions can be applied to both the `eager` and `require` helpers. The `where` top level operator will eventually be deprecated and replaced by the new `eager` [object notation](https://vincit.github.io/objection.js/#relationexpression-object-notation) in objection.js.

##### Examples using `$where`
The `$where` expression is used to "filter models". Given this, related fields between models can be mixed anywhere in the logical expression.

```json
{
  "eager": {
    "$where": {
      "$or": [
        { "city.country.name": "Australia" },
        { "city.code": "09" }
      ]
    }
  }
}
```

Logical expressions can also be nested
```json
{
  "eager": {
    "$where": {
      "$and": {
        "name": "John",
        "$or": [
          { "city.country.name": "Australia" },
          { "city.code": { "$like": "01" }}
        ]
      }
    }
  }
}
```

Note that in these examples, all logical expressions come _before_ the property name. However, logical expressions can also come _after_ the property name.

```json
{
  "eager": {
    "$where": {
      "$or": [
        { "city.country.name": "Australia" },
        {
          "city.code": {
            "$or": [
              { "$equals": "12" },
              { "$like": "13" }
            ]
          }
        }
      ]
    }
  }
}
```

The `$where` will apply to the relation that immediately precedes it in the tree, in the above case "city". The `$where` will apply to relations of the eager model using dot notation. For example, you can query `Customers`, eager load their `orders` and filter those orders by the `product.name`. Note that `product.name` is a related field of the order model, not the customers model.

# Custom Operators

If the built in filter operators aren't quite enough, custom operators can be added. A common use case for this may be to add a `lower case string comparison` operator, which may vary in implementation depending on the SQL dialect.

Example:

```js
const options = {
  operators: {
    $equalsLower: (property, operand, builder) =>
      builder.whereRaw('LOWER(??) = LOWER(?)', [property, operand])
  }
};

buildFilter(Person, null, options)
  .build({
    eager: {
      $where: {
        firstName: { $equalsLower: 'John' }
      }
    }
  })
```

The `$equalsLower` operator can now be used as a new operator and will use the custom operator callback specified.