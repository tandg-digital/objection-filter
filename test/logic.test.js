'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('logical expression filters', function () {

  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {

    describe(knexConfig.client, function() {
      var session, knex, Person, Animal, Movie;

      before(function () {
        session = testUtils.initialize(knexConfig);
        knex = session.knex;
        Person = session.models.Person;
        Animal = session.models.Animal;
        Movie = session.models.Movie;
      });

      before(function () {
        return testUtils.dropDb(session);
      });

      before(function () {
        return testUtils.createDb(session);
      });

      before(function () {
        return testUtils.insertData(session, {persons: 10, pets: 10, movies: 10});
      });

      describe('require using $or', function() {
        it('should filter based on top level $or', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': [
                  { 'movies.name': 'M00' },
                  { 'movies.name': 'M10' }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(2);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09', 'F08']);
              done();
            })
            .catch(done);
        });

        it('should filter based on nested $or', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': [
                  { 'movies.name': 'M00' },
                  { '$or': [
                    { 'movies.name': 'M10' },
                    { 'movies.name': 'M20' },
                  ] }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(3);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09', 'F08', 'F07']);
              done();
            })
            .catch(done);
        });

        it('should filter based on $or with object', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': {
                  'movies.name': 'M00',
                  'movies.code': 'C08'
                }
              }
            })
            .then(result => {
              result.length.should.equal(2);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F08', 'F09']);
              done();
            })
            .catch(done);
        });

        it('should filter with $or before and after property name', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': [
                  {
                    'movies.name': {
                      '$or': [
                        { '$equals': 'M00' },
                        { '$equals': 'M10' }
                      ]
                    }
                  },
                  {
                    'movies.name': {
                      '$or': [
                        { '$equals': 'M20' },
                        { '$equals': 'M30' }
                      ]
                    }
                  }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(4);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09', 'F08', 'F07', 'F06']);
              done();
            })
            .catch(done);
        });

        it('should handle early literals on $or after property name', done => {
          buildFilter(Person)
            .build({
              require: {
                firstName: {
                  $or: ['F00', 'F01']
                }
              }
            })
            .then(result => {
              result.length.should.equal(2);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F00', 'F01']);
              done();
            })
            .catch(done);
        });

        it('should handle early literals on $and after property name', done => {
          buildFilter(Person)
            .build({
              require: {
                firstName: {
                  $and: ['F00', 'F01']
                }
              }
            })
            .then(result => {
              result.length.should.equal(0);
              done();
            })
            .catch(done);
        });
      });

      describe('require using $and', function() {
        it('should filter based on top level $and', done => {
          buildFilter(Person)
            .build({
              require: {
                '$and': [
                  { 'movies.name': 'M00' },
                  { 'movies.code': 'C09' }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09']);
              done();
            })
            .catch(done);
        });

        it('should filter based on nested $and', done => {
          buildFilter(Person)
            .build({
              require: {
                $and: [
                  { 'movies.name': 'M00' },
                  {
                    $and: [
                      { 'movies.code': 'C09' }
                    ]
                  }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09']);
              done();
            })
            .catch(done);
        });

        it('should filter based on $and with object', done => {
          buildFilter(Person)
            .build({
              require: {
                '$and': {
                  'movies.name': 'M00',
                  'movies.code': 'C09'
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F09']);
              done();
            })
            .catch(done);
        });
      });

      describe('require using combinations of $or/$and', function() {
        it('should filter using top level $and with nested $or', done => {
          buildFilter(Person)
            .build({
              require: {
                $and: [
                  {
                    $or: [
                      { firstName: 'F00' },
                      { firstName: 'F01' }
                    ]
                  },
                  { id: { $gt: 0 } }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(2);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F00', 'F01']);
              done();
            })
            .catch(done);
        });

        it('should filter using top level $or with nested $and', done => {
          buildFilter(Person)
            .build({
              require: {
                $or: [
                  {
                    $and: [
                      { firstName: 'F00' },
                      { id: { $gt: 0 } }
                    ]
                  },
                  {
                    $and: [
                      { firstName: 'F01' },
                      { id: { $gt: 0 } }
                    ]
                  },
                ]
              }
            })
            .then(result => {
              result.length.should.equal(2);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F00', 'F01']);
              done();
            })
            .catch(done);
        });

        it('should filter using adjacent $and with $or', done => {
          buildFilter(Person)
            .build({
              require: {
                $and: [
                  { firstName: 'F00' },
                  { id: 1 }
                ],
                $or: [
                  { lastName: 'L09' },
                  { lastName: 'L08' }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F00']);
              done();
            })
            .catch(done);
        });

        it('should ensure end of expression $or is scoped', done => {
          // Should generate WHERE "firstName" = 'F01' AND ( ( ... ) OR ( ... ) )
          // not "firstName" = 'F01' OR ( ... ) OR ( ... )
          buildFilter(Person)
            .build({
              require: {
                firstName: 'F00',
                $or: [
                  { lastName: 'L09' },
                  { lastName: 'L08' }
                ]
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F00']);
              done();
            })
            .catch(done);
        });
      });

      describe('require using combinations of $or/$and after the propertyName', done => {
        it('should filter using top level $and with nested $or', done => {
          buildFilter(Person)
            .build({
              require: {
                firstName: {
                  $or: [
                    {
                      $and: [
                        { $like: 'F0%' },
                        { $like: '%00' }
                      ]
                    },
                    {
                      $and: [
                        { $like: 'F0%' },
                        { $like: '%01' }
                      ]
                    }
                  ]
                }
              }
            })
            .then(result => {
              result.length.should.equal(2);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F00', 'F01']);
              done();
            })
            .catch(done);
        });

        it('should filter using top level $or with nested $and', done => {
          buildFilter(Person)
            .build({
              require: {
                id: {
                  $and: [
                    {
                      $or: [
                        { $lte: 7 },
                        { $lte: 8 }
                      ]
                    },
                    {
                      $or: [
                        { $gte: 5 },
                        { $gte: 4 }
                      ]
                    }
                  ]
                }
              },
              order: 'firstName'
            })
            .then(result => {
              result.length.should.equal(5);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F03', 'F04', 'F05', 'F06', 'F07']);
              done();
            })
            .catch(done);
        });

        it('should ensure end of expression $or is scoped', done => {
          // Should generate WHERE "firstName" = 'F01' AND ( ( ... ) OR ( ... ) )
          // not "firstName" = 'F01' OR ( ... ) OR ( ... )
          buildFilter(Person)
            .build({
              require: {
                firstName: {
                  $equals: 'F00',
                  $or: [
                    { $equals: 'F00' },
                    { $equals: 'L01' }
                  ]
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const names = result.map(person => person.firstName);
              names.should.deep.equal(['F00']);
              done();
            })
            .catch(done);
        });
      });

      describe('error conditions', function() {
        const validationError = new Error('should have thrown an error');

        it('should throw an error on initial operator', done => {
          buildFilter(Person)
            .build({
              require: {
                '$gt': 1
              }
            })
            .then(() => done(validationError))
            .catch(err => done());
        });

        it('should throw an error on early literal', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': [ 'invalid' ]
              }
            })
            .then(() => done(validationError))
            .catch(err => done());
        });

        it('should throw an error on early operator', done => {
          buildFilter(Person)
            .build({
              require: {
                '$or': [{ '$gt': 1 }]
              }
            })
            .then(() => done(validationError))
            .catch(err => done());
        });
      });
    });
  });
});