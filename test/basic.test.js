'use strict';

const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('basic filters', function () {

  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {

    describe(knexConfig.client, function() {
      var session, knex, Person, Animal, Movie, MovieVersion;

      before(function () {
        session = testUtils.initialize(knexConfig);
        knex = session.knex;
        Person = session.models.Person;
        Animal = session.models.Animal;
        Movie = session.models.Movie;
        MovieVersion = session.models.MovieVersion;
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

      describe('filter attributes', function() {
        it('should limit', done => {
          buildFilter(Person)
            .build({
              limit: 1
            })
            .then(result => {
              result.should.be.an.an('array')
              result.should.have.length(1);
              done();
            })
            .catch(done);
        });

        it('should offset', done => {
          buildFilter(Person)
            .build({
              limit: 1,
              offset: 1
            })
            .then(result => {
              result.should.be.an.an('array')
              result.should.have.length(1);
              result[0].firstName.should.equal('F01');
              done();
            })
            .catch(done);
        });

        it('should select limited fields', done => {
          buildFilter(Person)
            .build({
              limit: 1,
              fields: ['id']
            })
            .then(result => {
              result.should.be.an.an('array')
              result.should.have.length(1);
              _.keys(result[0]).should.deep.equal(['id']);
              done();
            })
            .catch(done);
        });

        it('should order by descending', done => {
          buildFilter(Person)
            .build({
              order: 'id desc'
            })
            .then(result => {
              result.should.be.an.an('array')
              result.map(item => item.id).should.deep.equal([
                10,9,8,7,6,5,4,3,2,1
              ]);
              done();
            })
            .catch(done);
        });

        it('should order by ascending', done => {
          buildFilter(Person)
            .build({
              order: 'id asc'
            })
            .then(result => {
              result.should.be.an.an('array')
              result.map(item => item.id).should.deep.equal([
                1,2,3,4,5,6,7,8,9,10
              ]);
              done();
            })
            .catch(done);
        });

        it('should order by implicit ascending', done => {
          buildFilter(Person)
            .build({
              order: 'id'
            })
            .then(result => {
              result.should.be.an.an('array')
              result.map(item => item.id).should.deep.equal([
                1,2,3,4,5,6,7,8,9,10
              ]);
              done();
            })
            .catch(done);
        });
      });

      describe('eager loaded data', function() {
        it('should include eagerly loaded data', done => {
          buildFilter(Person)
            .build({
              eager: 'movies'
            })
            .then(result => {
              result.should.be.an.an('array')
              _.forEach(person => person.movies.should.be.an.array);
              done();
            })
            .catch(done);
        });

        it('should only select some fields on eagerly loaded models', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              fields: ['movies.id']
            })
            .then(result => {
              _.forEach(result, person => {
                _.forEach(person.movies, movie => {
                  _.keys(movie).should.deep.equal(['id']);
                })
              })
              done();
            })
            .catch(done);
        });

        it('should filter the root model', done => {
          buildFilter(Person)
            .build({
              where: {
                firstName: 'F00'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              result[0].firstName.should.equal('F00');
              done();
            })
            .catch(done);
        });

        it('should filter eagerly loaded data using `where in`', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              where: {
                'movies.name': 'M99'
              }
            })
            .then(result => {
              result.length.should.equal(10); // Should inclue all root models regardless of condition
              _.forEach(result, person => {
                person.movies.forEach(movie => {
                  movie.name.should.equal('M99');
                });
              })
              done();
            })
            .catch(done);
        });

        it('should filter eagerly loaded 1-deep data using `join`', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': 'M99'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              result[0].firstName.should.equal('F00');
              done();
            })
            .catch(done);
        });

        it('should filter eagerly loaded 2-deep data using `join`', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'parent.movies.name': 'M99'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              result[0].firstName.should.equal('F01');
              done();
            })
            .catch(done);
        });

        it('should require with composite keys', done => {
          buildFilter(MovieVersion)
            .build({
              eager: 'movie',
              require: {
                'movie.name': 'M00'
              }
            })
            .then(result => {
              result.length.should.equal(1);
              result[0].movieId.should.equal(100);
              result[0].movie.name.should.equal('M00');
              done();
            })
            .catch(done);
        });

        it('should order eagerly loaded model', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              order: 'movies.id asc',
              limit: 1
            })
            .then(result => {
              result.should.be.an.an('array')
              result.forEach(person => {
                [].concat(person.movies.map(movie => movie.id)).sort((a,b) => a > b)
                  .should.deep.equal(
                    person.movies.map(movie => movie.id)
                  );
              });
              done();
            })
            .catch(done);
        });

        it('should order eagerly loaded model descending', done => {
          buildFilter(Person)
            .build({
              eager: 'movies',
              order: 'movies.id desc',
              limit: 1
            })
            .then(result => {
              result.should.be.an.an('array')
              result.forEach(person => {
                [].concat(person.movies.map(movie => movie.id)).sort((a,b) => a < b)
                  .should.deep.equal(
                    person.movies.map(movie => movie.id)
                  );
              });
              done();
            })
            .catch(done);
        });
      });

      describe('controls and errors', function() {
        it('should limit eager expressions', done => {
          buildFilter(Person)
            .allowEager('pets')
            .build({
              eager: 'movies'
            })
            .then(result => {
              done(new Error('Eager expression should not be allowed'));
            })
            .catch(err => {
              err.statusCode.should.equal(400);
              done();
            });
        });
      });
    });
  });
});
