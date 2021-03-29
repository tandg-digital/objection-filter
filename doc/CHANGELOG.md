# Changelog

### 4.2.0

- Optimized the sql query so that belongsTo and hasOne relations both perform similarly when filtering

### 4.1.1

  - Added support for Node v14 [PR #34](https://github.com/tandg-digital/objection-filter/pull/34)

### 4.1.0

- Optimized the sql query so that when only joining onto belongsTo relations, it doesn't create a separate filter query. This significantly improves performance in some specific use cases.

### 4.0.1

- Exported the `getPropertiesFromExpression` function on the main interface

### 4.0.0

I've made this a major version bump due to the Typescript update, and the removal of Node version 8 support. There are no new features additions though, so no need for migration.

- Remove support for Node.js 8.x.x (only supports v10 and v12 at the moment)
- Refactor main codebase to [Typescript](https://www.typescriptlang.org/)
- Implement precommit hooks for eslint and [prettier](https://github.com/prettier/prettier)
- Updated some dev dependencies

### 3.0.0

* Update to [objection 2.1.2](https://github.com/tandg-digital/objection-filter/issues/28)
* Fix [incorrect documentation around aggregations](https://github.com/tandg-digital/objection-filter/issues/25)
* Update dev dependencies

### 2.1.0

* Fix [bug](https://github.com/tandg-digital/objection-filter/issues/14) when aggregating on a base model with a composite id

### 2.0.0

* Add [aggregations](doc/AGGREGATIONS.md) feature
* Fix bug with [count](https://github.com/tandg-digital/objection-filter/pull/13)
* Tests now run with sqlite, postgresql and msyql drivers

### 1.4.0

* Fix bug with [ambiguous column name](https://github.com/tandg-digital/objection-filter/pull/12)
* Fix bug with [order expression spaces](https://github.com/tandg-digital/objection-filter/pull/11)
* Tidy up eslint configuration

### 1.3.0

* Can now use models which have [composite id keys](https://github.com/tandg-digital/objection-filter/pull/10)

### 1.2.0

* Allow filtering on related models on the root model and eagerly loaded models

### 1.1.0

* Operators can now be applied before and after a property name

### 1.0.0

* Added filtering using nested or/and logical expressions
* Added object-notation for eager loading and filtering
