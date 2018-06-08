'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('complex filters', function () {

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

      describe('edge cases', function() {
        it('should do nothing with no expression', done => {
          buildFilter(Person)
            .build()
            .then(result => {
              result.length.should.equal(10);
              result.map(item => item.firstName).should.deep.equal([
                'F00','F01','F02','F03','F04','F05','F06','F07','F08','F09'
              ]);
              done();
            })
            .catch(done);
        });

        it('should do nothing with no operator', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $invalid: 'M09'
                }
              }
            })
            .then(result => {
              result.length.should.equal(10);
              result.map(item => item.firstName).should.deep.equal([
                'F00','F01','F02','F03','F04','F05','F06','F07','F08','F09'
              ]);
              done();
            })
            .catch(done);
        });

        it('should be equivalent if require/where on a root model column', done => {
          const requireQuery = buildFilter(Person)
            .build({
              require: {
                firstName: 'F01'
              }
            });

          const whereQuery = buildFilter(Person)
            .build({
              where: {
                firstName: 'F01'
              }
            });

          Promise.all([requireQuery, whereQuery])
            .then(([results1, results2]) => {
              results1.should.deep.equal(results2);
              done();
            })
            .catch(done);
        });
      });

      describe('comparative operators', function() {
        it('should search related model using full-string $like', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $like: 'M09'
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using sub-string $like', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  $like: 'M0%'
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using $gt', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $gt: 98
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using $lt', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $lt: 2
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F00');
              done();
            })
            .catch(done);
        });

        it('should search related model using $gte', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $gte: 99
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using $lte', done => {
          buildFilter(Person)
            .build({
              require: {
                'movies.id': {
                  $lte: 3
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F00')
              done();
            })
            .catch(done);
        });


        it('should search related model using $exists', done => {
          buildFilter(Person)
            .build({
              require: {
                'movies.code': {
                  $exists: true
                }
              }
            })
            .then(result => {
              result.length.should.equal(5);
              result.map(item => item.firstName).should.deep.equal([
                'F05','F06','F07','F08','F09'
              ]);
              done();
            })
            .catch(done);
        });

        it('should search related model using !$exists', done => {
          buildFilter(Person)
            .build({
              require: {
                'movies.code': {
                  $exists: false
                }
              }
            })
            .then(result => {
              result.length.should.equal(5);
              result.map(item => item.firstName).should.deep.equal([
                'F00','F01','F02','F03','F04'
              ]);
              done();
            })
            .catch(done);
        });

        it('should search related model using explicit $equals', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $equals: 98
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using explicit `=`', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  '=': 98
                }
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              done();
            })
            .catch(done);
        });

        it('should search related model using $in', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.id': {
                  $in: [ 88, 98 ]
                }
              }
            })
            .then(result => {
              result.length.should.equal(2);
              result.map(item => item.firstName).should.deep.equal([
                'F08', 'F09'
              ]);
              done();
            })
            .catch(done);
        });
      });

      describe('logical operators', function() {
        it('should search root model using `require $or $like`', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  '$or': [
                    { '$like': 'M99' },
                    { '$like': 'M89'}
                  ]
                }
              }
            })
            .then(result => {
              result.map(item => item.firstName).should.deep.equal([
                'F00', 'F01'
              ]);
              done();
            })
            .catch(done);
        });

        it('should search root model using `require $or` and different comparators', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  '$or': [
                    { '$like': 'M99' },
                    { '$equals': 'M89'}
                  ]
                }
              }
            })
            .then(result => {
              result.map(item => item.firstName).should.deep.equal([
                'F00', 'F01'
              ]);
              done();
            })
            .catch(done);
        });

        it('should search root model using `require $or` and operand values', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  '$or': [
                    'M99',
                    'M89'
                  ]
                }
              }
            })
            .then(result => {
              result.map(item => item.firstName).should.deep.equal([
                'F01', 'F00'
              ]);
              done();
            })
            .catch(done);
        });

        it('should search root model using `require $or` and no values', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': {
                  '$or': []
                }
              }
            })
            .then(result => {
              result.map(item => item.firstName).should.deep.equal([
                'F00', 'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'
              ]);
              done();
            })
            .catch(done);
        });
      });

      describe('filter combinations', function() {
        it('should `require` and `where` on the same relation', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              where: {
               'movies.name': 'M09'
              },
              require: {
                'movies.name': 'M09'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              person.movies.should.be.an('array');
              person.movies.length.should.equal(1);
              person.movies[0].name.should.equal('M09');
              done();
            })
            .catch(done);
        });

        it('should `require` and `where` on different relations', done => {
          buildFilter(Person)
            .build({
              eager: 'pets',
              require: {
                'movies.name': 'M09'
              },
              where: {
                'pets.name': 'P90'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              const person = result[0];
              person.firstName.should.equal('F09');
              person.pets.should.be.an('array');
              person.pets.length.should.equal(1);
              person.pets[0].name.should.equal('P90');
              done();
            })
            .catch(done);
        });
      });
    });
  });
});