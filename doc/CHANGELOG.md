# Changelog

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