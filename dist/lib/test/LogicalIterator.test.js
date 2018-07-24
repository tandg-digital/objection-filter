'use strict';

var _ = require('lodash');
require('chai').should();
var expect = require('chai').expect;

var _require = require('../LogicalIterator'),
    getPropertiesFromExpression = _require.getPropertiesFromExpression;

describe('LogicalIterator', function () {
  describe('getPropertiesFromExpression with default test', function () {
    it('should get top level properties', function () {
      getPropertiesFromExpression({ name: 'a' }).should.deep.equal(['name']);
    });

    it('should get child properties of logical operator', function () {
      getPropertiesFromExpression({
        $or: [{
          name: 'a'
        }, {
          name: 'b'
        }, {
          count: 1
        }]
      }).should.deep.equal(['name', 'count']);
    });

    it('should get child properties of nested logical operator', function () {
      getPropertiesFromExpression({
        $or: [{
          name: 'a'
        }, {
          $and: [{ count: 1 }, { location: 5 }]
        }]
      }).should.deep.equal(['name', 'count', 'location']);
    });

    it('should get child properties of nested logical object notation', function () {
      getPropertiesFromExpression({
        $or: [{
          name: 'a'
        }, {
          $and: {
            count: 1,
            location: 1
          }
        }]
      }).should.deep.equal(['name', 'count', 'location']);
    });

    it('should get related properties', function () {
      getPropertiesFromExpression({
        $or: [{
          'movies.name': 'a'
        }, {
          $and: {
            'favorites.count': 1,
            location: 1
          }
        }]
      }).should.deep.equal(['movies.name', 'favorites.count', 'location']);
    });
  });

  describe('getPropertiesFromExpression with custom test', function () {
    var test = function test(name) {
      return name !== 'xyz';
    };

    it('should get top level properties', function () {
      getPropertiesFromExpression({ name: 'a', xyz: 'b' }, test).should.deep.equal(['name']);
    });

    it('should get child properties of logical operator', function () {
      getPropertiesFromExpression({
        $or: [{
          name: 'a'
        }, {
          name: 'b'
        }, {
          count: 1
        }]
      }, test).should.deep.equal(['name', 'count']);
    });

    it('should get child properties of nested logical operator', function () {
      getPropertiesFromExpression({
        $or: [{
          name: 'a'
        }, {
          $and: [{ count: 1, xyz: 1 }, { location: 5 }]
        }]
      }, test).should.deep.equal(['name', 'count', 'location']);
    });

    it('should get child properties of nested logical object notation', function () {
      getPropertiesFromExpression({
        $or: [{
          name: 'a',
          xyz: 1
        }, {
          $and: {
            count: 1,
            location: 1
          }
        }]
      }, test).should.deep.equal(['name', 'count', 'location']);
    });

    it('should get related properties', function () {
      getPropertiesFromExpression({
        $or: [{
          'movies.name': 'a'
        }, {
          $and: {
            'favorites.count': 1,
            location: 1,
            xyz: 1
          }
        }]
      }, test).should.deep.equal(['movies.name', 'favorites.count', 'location']);
    });
  });
});