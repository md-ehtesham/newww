var generateCrumb = require("../handlers/crumb.js"),
  Lab = require('lab'),
  Code = require('code'),
  nock = require('nock'),
  lab = exports.lab = Lab.script(),
  describe = lab.experiment,
  before = lab.before,
  after = lab.after,
  it = lab.test,
  expect = Code.expect,
  server,
  fixtures = require('../fixtures');

var URL = require('url');
var qs = require('qs');

var requireInject = require('require-inject');
var redisMock = require('redis-mock');
var client = redisMock.createClient();

var TokenFacilitator = require('token-facilitator');

before(function(done) {
  requireInject.installGlobally('../mocks/server', {
    redis: redisMock
  })(function(obj) {
    server = obj;
    done();
  });
});

after(function(done) {
  server.stop(done);
});

describe('getting to the org marketing page', function() {
  it('redirects from /orgs properly', function(done) {
    var options = {
      url: "/orgs"
    };

    server.inject(options, function(resp) {
      expect(resp.statusCode).to.equal(301);
      expect(resp.headers.location).to.equal('/org');
      done();
    });
  });

  it('redirects from /org to the /npm/private-packages page properly', function(done) {
    var options = {
      url: "/org"
    };

    server.inject(options, function(resp) {
      expect(resp.statusCode).to.equal(301);
      expect(resp.headers.location).to.equal('/npm/private-packages');
      done();
    });
  });

  it('redirects from /orgs/orgname properly', function(done) {
    var options = {
      url: "/orgs/orgname"
    };

    server.inject(options, function(resp) {
      expect(resp.statusCode).to.equal(301);
      expect(resp.headers.location).to.equal('/org/orgname');
      done();
    });
  });

  it('renders a 404 if the orgname is not valid while attempting to redirect from /orgs/orgname', function(done) {
    var options = {
      url: "/orgs/.invalid"
    };

    server.inject(options, function(resp) {
      expect(resp.statusCode).to.equal(404);
      expect(resp.request.response.source.template).to.equal('errors/not-found');
      done();
    });
  });
});


describe('getting an org', function() {
  it('does not include sponsorships if the org has not sponsored anyone', function(done) {
    var userMock = nock("https://user-api-example.com")
      .get("/user/bob")
      .reply(200, fixtures.users.bob);

    var licenseMock = nock("https://license-api-example.com")
      .get("/customer/bob@boom.me")
      .reply(200, fixtures.customers.fetched_happy)
      .get("/customer/bob/stripe/subscription?org=bigco")
      .reply(200, [])
      .get("/customer/bob/stripe")
      .reply(404);


    var orgMock = nock("https://user-api-example.com")
      .get('/org/bigco')
      .reply(200, fixtures.orgs.bigco)
      .get('/org/bigco/user?per_page=100&page=0')
      .reply(200, fixtures.orgs.bigcoUsers)
      .get('/org/bigco/package?per_page=100&page=0')
      .reply(200, {
        count: 1,
        items: [fixtures.packages.fake]
      })
      .get('/org/bigco/team?per_page=100&page=0')
      .reply(200, fixtures.teams.bigcoOrg);


    var options = {
      url: "/org/bigco",
      credentials: fixtures.users.bob
    };

    server.inject(options, function(resp) {
      userMock.done();
      licenseMock.done();
      orgMock.done();
      expect(resp.statusCode).to.equal(200);
      expect(resp.request.response.source.template).to.equal('org/show');
      var users = resp.request.response.source.context.org.users.items;
      var sponsoredByOrg = users.filter(function(user) {
        return user.sponsoredByOrg;
      });
      expect(sponsoredByOrg.length).to.equal(0);
      expect(resp.request.response.source.context.org.price).to.equal(14);
      done();
    });
  });

  it('includes sponsorships if the org has sponsored someone', function(done) {
    var userMock = nock("https://user-api-example.com")
      .get("/user/bob")
      .reply(200, fixtures.users.bob);

    var licenseMock = nock("https://license-api-example.com")
      .get("/customer/bob/stripe/subscription?org=bigco")
      .reply(200, [
        {
          "id": "sub_12346",
          "current_period_end": 1439766874,
          "current_period_start": 1437088474,
          "quantity": 3,
          "status": "active",
          "interval": "month",
          "amount": 700,
          "license_id": 1,
          "npm_org": "bigco",
          "npm_user": "bob",
          "product_id": "1031405a-70b7-4a3f-b557-8609d9e1428a"
        }
      ]);

    var orgMock = nock("https://user-api-example.com")
      .get('/org/bigco')
      .reply(200, fixtures.orgs.bigco)
      .get('/org/bigco/user?per_page=100&page=0')
      .reply(200, fixtures.orgs.bigcoAddedUsers)
      .get('/org/bigco/package?per_page=100&page=0')
      .reply(200, {
        count: 1,
        items: [fixtures.packages.fake]
      })
      .get('/org/bigco/team?per_page=100&page=0')
      .reply(200, fixtures.teams.bigcoOrg);


    var options = {
      url: "/org/bigco",
      credentials: fixtures.users.bob
    };

    server.inject(options, function(resp) {
      userMock.done();
      licenseMock.done();
      orgMock.done();
      expect(resp.statusCode).to.equal(200);
      expect(resp.request.response.source.template).to.equal('org/show');
      var users = resp.request.response.source.context.org.users.items;
      var sponsoredByOrg = users.filter(function(user) {
        return user.sponsoredByOrg;
      });
      expect(sponsoredByOrg.length).to.not.equal(0);
      var numSponsored = resp.request.response.source.context.org.users.numSponsored;
      expect(numSponsored).to.equal(3);
      expect(resp.request.response.source.context.org.price).to.equal(21);
      done();
    });
  });

  it('does not show org if org does not exist', function(done) {
    var userMock = nock("https://user-api-example.com")
      .get("/user/bob")
      .reply(200, fixtures.users.bob);

    var licenseMock = nock("https://license-api-example.com")
      .get("/customer/bob/stripe")
      .reply(404);

    var orgMock = nock("https://user-api-example.com")
      .get("/org/bigconotthere")
      .reply(404)
      .get("/org/bigconotthere/user?per_page=100&page=0")
      .reply(404)
      .get("/org/bigconotthere/package?per_page=100&page=0")
      .reply(404)
      .get("/org/bigconotthere/team?per_page=100&page=0")
      .reply(404);


    var options = {
      url: "/org/bigconotthere",
      credentials: fixtures.users.bob
    };

    server.inject(options, function(resp) {
      userMock.done();
      orgMock.done();
      licenseMock.done();
      expect(resp.statusCode).to.equal(404);
      done();
    });
  });

  it('allows an unpaid super-admin to see the org', function(done) {
    var userMock = nock("https://user-api-example.com")
      .get("/user/bob")
      .reply(200, fixtures.users.bob);

    var licenseMock = nock("https://license-api-example.com")
      .get("/customer/bob@boom.me")
      .reply(404)
      .get("/customer/bob/stripe/subscription?org=bigco")
      .reply(200, [])
      .get("/customer/bob/stripe")
      .reply(404);

    var orgMock = nock("https://user-api-example.com")
      .get('/org/bigco')
      .reply(200, fixtures.orgs.bigco)
      .get('/org/bigco/user?per_page=100&page=0')
      .reply(200, fixtures.orgs.bigcoUsers)
      .get('/org/bigco/package?per_page=100&page=0')
      .reply(200, {
        count: 1,
        items: [fixtures.packages.fake]
      })
      .get('/org/bigco/team?per_page=100&page=0')
      .reply(200, fixtures.teams.bigcoOrg);

    var options = {
      url: "/org/bigco",
      credentials: fixtures.users.bob
    };

    server.inject(options, function(resp) {
      userMock.done();
      licenseMock.done();
      orgMock.done();
      expect(resp.statusCode).to.equal(200);
      expect(resp.request.response.source.context.perms.isSuperAdmin).to.equal(true);
      expect(resp.request.response.source.context.perms.isAtLeastTeamAdmin).to.equal(true);
      expect(resp.request.response.source.context.perms.isAtLeastMember).to.equal(true);
      done();
    });
  });

  it('does not allow a non-super-admin to see the org payment-info', function(done) {
    var userMock = nock("https://user-api-example.com")
      .get("/user/betty")
      .reply(200, fixtures.users.betty);

    var licenseMock = nock("https://license-api-example.com")
      .get("/customer/betty/stripe")
      .reply(404);

    var orgMock = nock("https://user-api-example.com")
      .get('/org/bigco')
      .reply(200, fixtures.orgs.bigco)
      .get('/org/bigco/user?per_page=100&page=0')
      .reply(200, fixtures.orgs.bigcoUsers)
      .get('/org/bigco/package?per_page=100&page=0')
      .reply(200, {
        count: 1,
        items: [fixtures.packages.fake]
      })
      .get('/org/bigco/team?per_page=100&page=0')
      .reply(200, fixtures.teams.bigcoOrg);

    var options = {
      url: "/org/bigco/payment-info",
      credentials: fixtures.users.betty
    };

    server.inject(options, function(resp) {
      userMock.done();
      licenseMock.done();
      orgMock.done();
      var redirectPath = resp.headers.location;
      var url = URL.parse(redirectPath);
      var query = url.query;
      var token = qs.parse(query).notice;
      var tokenFacilitator = new TokenFacilitator({
        redis: client
      });
      expect(redirectPath).to.include('/org/bigco');
      expect(token).to.be.string();
      expect(token).to.not.be.empty();
      expect(resp.statusCode).to.equal(302);
      tokenFacilitator.read(token, {
        prefix: "notice:"
      }, function(err, notice) {
        expect(err).to.not.exist();
        expect(notice.notices).to.be.array();
        expect(notice.notices[0].notice).to.equal('You are not authorized to access this page');
        done();
      });
    });
  });

  describe('org member permissions', function() {
    it('does not give any perms if user is not a member of the org', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var orgMock = nock("https://user-api-example.com")
        .get('/org/notbobsorg')
        .reply(200, fixtures.orgs.notBobsOrg)
        .get('/org/notbobsorg/user?per_page=100&page=0')
        .reply(200, fixtures.orgs.notBobsOrgUsers)
        .get('/org/notbobsorg/package?per_page=100&page=0')
        .reply(200, {
          count: 1,
          items: [fixtures.packages.fake]
        })
        .get('/org/notbobsorg/team?per_page=100&page=0')
        .reply(401);

      var options = {
        url: "/org/notbobsorg",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        orgMock.done();
        expect(resp.request.response.source.context.perms.isSuperAdmin).to.equal(false);
        expect(resp.request.response.source.context.perms.isAtLeastTeamAdmin).to.equal(false);
        expect(resp.request.response.source.context.perms.isAtLeastMember).to.equal(false);
        done();
      });
    });

    it('has all orgs-level permissions if current user is super admin', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob@boom.me")
        .reply(200, fixtures.customers.fetched_happy)
        .get("/customer/bob/stripe")
        .reply(404);

      var orgMock = nock("https://user-api-example.com")
        .get('/org/bigco')
        .reply(200, fixtures.orgs.bigco)
        .get('/org/bigco/user?per_page=100&page=0')
        .reply(200, fixtures.orgs.bigcoUsers)
        .get('/org/bigco/package?per_page=100&page=0')
        .reply(200, {
          count: 1,
          items: [fixtures.packages.fake]
        })
        .get('/org/bigco/team?per_page=100&page=0')
        .reply(200, fixtures.teams.bigcoOrg);

      var options = {
        url: "/org/bigco",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        orgMock.done();
        expect(resp.statusCode).to.equal(200);
        expect(resp.request.response.source.context.perms.isSuperAdmin).to.equal(true);
        expect(resp.request.response.source.context.perms.isAtLeastTeamAdmin).to.equal(true);
        expect(resp.request.response.source.context.perms.isAtLeastMember).to.equal(true);
        done();
      });
    });

    it('has only isAtLeastTeamAdmin and isMember permissions if current user is team admin', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var orgMock = nock("https://user-api-example.com")
        .get('/org/bigco')
        .reply(200, fixtures.orgs.bigco)
        .get('/org/bigco/user?per_page=100&page=0')
        .reply(200, fixtures.orgs.bigcoAddedUsers)
        .get('/org/bigco/package?per_page=100&page=0')
        .reply(200, {
          count: 1,
          items: [fixtures.packages.fake]
        })
        .get('/org/bigco/team?per_page=100&page=0')
        .reply(200, fixtures.teams.bigcoOrg);

      var options = {
        url: "/org/bigco",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        orgMock.done();
        expect(resp.request.response.source.context.perms.isSuperAdmin).to.equal(false);
        expect(resp.request.response.source.context.perms.isAtLeastTeamAdmin).to.equal(true);
        expect(resp.request.response.source.context.perms.isAtLeastMember).to.equal(true);
        done();
      });
    });

    it('has only isAtLeastMember permissions if current user is developer', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/betty")
        .reply(200, fixtures.users.betty);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/betty/stripe")
        .reply(404);

      var orgMock = nock("https://user-api-example.com")
        .get('/org/bigco')
        .reply(200, fixtures.orgs.bigco)
        .get('/org/bigco/user?per_page=100&page=0')
        .reply(200, fixtures.orgs.bigcoAddedUsers)
        .get('/org/bigco/package?per_page=100&page=0')
        .reply(200, {
          count: 1,
          items: [fixtures.packages.fake]
        })
        .get('/org/bigco/team?per_page=100&page=0')
        .reply(200, fixtures.teams.bigcoOrg);

      var options = {
        url: "/org/bigco",
        credentials: fixtures.users.betty
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        orgMock.done();
        expect(resp.request.response.source.context.perms.isSuperAdmin).to.equal(false);
        expect(resp.request.response.source.context.perms.isAtLeastTeamAdmin).to.equal(false);
        expect(resp.request.response.source.context.perms.isAtLeastMember).to.equal(true);
        done();
      });
    });
  });

  it('passes human_name attribute if human_name is set', function(done) {
    var userMock = nock("https://user-api-example.com")
      .get("/user/bob")
      .reply(200, fixtures.users.bob);

    var licenseMock = nock("https://license-api-example.com")
      .get("/customer/bob/stripe")
      .reply(404);

    var orgMock = nock("https://user-api-example.com")
      .get('/org/bigco')
      .reply(200, fixtures.orgs.bigco)
      .get('/org/bigco/user?per_page=100&page=0')
      .reply(200, fixtures.orgs.bigcoAddedUsers)
      .get('/org/bigco/package?per_page=100&page=0')
      .reply(200, {
        count: 1,
        items: [fixtures.packages.fake]
      })
      .get('/org/bigco/team?per_page=100&page=0')
      .reply(200, fixtures.teams.bigcoOrg);

    var options = {
      url: "/org/bigco",
      credentials: fixtures.users.bob
    };

    server.inject(options, function(resp) {
      userMock.done();
      licenseMock.done();
      orgMock.done();
      expect(resp.request.response.source.context.org.info.name).to.equal("bigco");
      expect(resp.request.response.source.context.org.info.human_name).to.equal("BigCo Enterprises");
      done();
    });
  });

  it('passes human_name attribute as scope name if human_name is not set', function(done) {
    var userMock = nock("https://user-api-example.com")
      .get("/user/bob")
      .reply(200, fixtures.users.bob);

    var licenseMock = nock("https://license-api-example.com")
      .get("/customer/bob/stripe/subscription?org=bigco")
      .reply(200, [])
      .get("/customer/bob/stripe")
      .reply(404);

    var orgMock = nock("https://user-api-example.com")
      .get('/org/bigco')
      .reply(200, {
        "name": "bigco",
        "description": "bigco organization",
        "resource": {},
        "created": "2015-07-10T20:29:37.816Z",
        "updated": "2015-07-10T21:07:16.799Z",
        "deleted": null
      })
      .get('/org/bigco/user?per_page=100&page=0')
      .reply(200, fixtures.orgs.bigcoAddedUsers)
      .get('/org/bigco/package?per_page=100&page=0')
      .reply(200, {
        count: 1,
        items: [fixtures.packages.fake]
      })
      .get('/org/bigco/team?per_page=100&page=0')
      .reply(200, fixtures.teams.bigcoOrg);

    var options = {
      url: "/org/bigco",
      credentials: fixtures.users.bob
    };

    server.inject(options, function(resp) {
      userMock.done();
      licenseMock.done();
      orgMock.done();
      expect(resp.request.response.source.context.org.info.name).to.equal("bigco");
      expect(resp.request.response.source.context.org.info.human_name).to.equal("bigco");
      done();
    });
  });

  it('keeps you out of the payment-info page if you do not have super-admin permissions', function(done) {
    var userMock = nock("https://user-api-example.com")
      .get("/user/bob")
      .reply(200, fixtures.users.bob);

    var orgMock = nock("https://user-api-example.com")
      .get('/org/bigco')
      .reply(200, {
        "name": "bigco",
        "description": "bigco organization",
        "resource": {},
        "created": "2015-07-10T20:29:37.816Z",
        "updated": "2015-07-10T21:07:16.799Z",
        "deleted": null
      })
      .get('/org/bigco/user?per_page=100&page=0')
      .reply(200, fixtures.orgs.bigcoAddedUsers)
      .get('/org/bigco/package?per_page=100&page=0')
      .reply(200, {
        count: 1,
        items: [fixtures.packages.fake]
      })
      .get('/org/bigco/team?per_page=100&page=0')
      .reply(200, fixtures.teams.bigcoOrg);

    var options = {
      url: "/org/bigco/payment-info",
      credentials: fixtures.users.bob
    };

    server.inject(options, function(resp) {
      userMock.done();
      orgMock.done();
      var redirectPath = resp.headers.location;
      var url = URL.parse(redirectPath);
      var query = url.query;
      var token = qs.parse(query).notice;
      var tokenFacilitator = new TokenFacilitator({
        redis: client
      });
      expect(redirectPath).to.include('/org/bigco');
      expect(token).to.be.string();
      expect(token).to.not.be.empty();
      expect(resp.statusCode).to.equal(302);
      tokenFacilitator.read(token, {
        prefix: "notice:"
      }, function(err, notice) {
        expect(err).to.not.exist();
        expect(notice.notices).to.be.array();
        expect(notice.notices[0].notice).to.equal('You are not authorized to access this page');
        done();
      });
    });
  });

});

describe('creating an org', function() {
  it('redirects back to org/create if the org scope name is in use by another org', function(done) {
    var userMock = nock("https://user-api-example.com")
      .get("/user/bob")
      .reply(200, fixtures.users.bob);

    var licenseMock = nock("https://license-api-example.com")
      .get("/customer/bob/stripe")
      .reply(404);

    var orgMock = nock("https://user-api-example.com")
      .get("/org/bigco")
      .reply(200, fixtures.orgs.bigco)
      .get("/org/bigco/user?per_page=100&page=0")
      .reply(200, fixtures.orgs.bigcoAddedUsers)
      .get("/org/bigco/package?per_page=100&page=0")
      .reply(200, fixtures.packages.fake)
      .get('/org/bigco/team?per_page=100&page=0')
      .reply(200, fixtures.teams.bigcoOrg);

    var options = {
      url: "/org/create-validation?orgScope=bigco&human-name=Bob's big co",
      method: "GET",
      credentials: fixtures.users.bob
    };

    server.inject(options, function(resp) {
      userMock.done();
      licenseMock.done();
      orgMock.done();
      expect(resp.statusCode).to.equal(302);
      expect(resp.request.response.headers.location).to.match(/org\/create/);
      done();
    });

  });

  it('redirects back to org/create if the org scope name is in use by somebody else\'s name', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob)
        .get("/user/bigco")
        .reply(200, fixtures.users.bigco);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco")
        .reply(404, fixtures.orgs.bigco)
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(404, fixtures.orgs.bigcoAddedUsers)
        .get("/org/bigco/package?per_page=100&page=0")
        .reply(404, fixtures.packages.fake)
        .get("/org/bigco/team?per_page=100&page=0")
        .reply(404);

      var options = {
        url: "/org/create-validation?orgScope=bigco&human-name=Bob's big co",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        orgMock.done();
        expect(resp.statusCode).to.equal(302);
        expect(resp.request.response.headers.location).to.match(/org\/create/);
        done();
      });
    });
  });

  it('redirects back to org/create if the org scope name is in use by the current user\'s name', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var options = {
        url: "/org/create-validation?orgScope=bob&human-name=Bob's big co",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        expect(resp.statusCode).to.equal(302);
        expect(resp.request.response.headers.location).to.match(/org\/create/);
        done();
      });
    });
  });

  it('redirects back to org/create if the org scope name is not valid', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var options = {
        url: "/org/create-validation?orgScope=afdo@;;;383&human-name=Bob's big co",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        expect(resp.statusCode).to.equal(302);
        expect(resp.request.response.headers.location).to.match(/org\/create/);
        done();
      });
    });
  });

  it('validates that an org is available when its name is not taken by a current user or org', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob)
        .get("/user/bigco")
        .reply(404, fixtures.users.bigco);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco")
        .reply(404, fixtures.orgs.bigco)
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(404, fixtures.orgs.bigcoAddedUsers)
        .get("/org/bigco/package?per_page=100&page=0")
        .reply(404, fixtures.packages.fake)
        .get("/org/bigco/team?per_page=100&page=0")
        .reply(404);

      var options = {
        url: "/org/create-validation?orgScope=bigco&human-name=Bob's big co",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        orgMock.done();
        expect(resp.statusCode).to.equal(302);
        expect(resp.request.response.headers.location).to.match(/org\/create\/billing/);
        done();
      });
    });
  });
});

describe('transferring username to org', function() {
  it('does not allow access to transfer page without valid input', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var options = {
        url: "/org/transfer-user-name?human-name=Bob's big co&orgScope=adsjo@ffoo;;",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        expect(resp.statusCode).to.equal(302);
        expect(resp.request.response.headers.location).to.match(/org\/create/);
        done();
      });
    });
  });

  it('allows transfer page access with valid input', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var options = {
        url: "/org/transfer-user-name?human-name=Bob's big co&orgScope=bob",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        expect(resp.statusCode).to.equal(200);
        done();
      });
    });
  });

  it('allows org create billing page access with valid input and no new user', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var options = {
        url: "/org/create/billing?orgScope=org-915001&human-name=Bob%27s%20Org%20Is%20Cool",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        expect(resp.statusCode).to.equal(200);
        done();
      });
    });
  });

  it('allows org create billing page access with valid input and new user', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob)
        .get("/user/bigco")
        .reply(404)
        .get("/org/bigco")
        .reply(404)
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(404)
        .get("/org/bigco/package?per_page=100&page=0")
        .reply(404);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var options = {
        url: "/org/create/billing?orgScope=org-915001&human-name=Bob%27s%20Org%20Is%20Cool&new-user=bigco",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        licenseMock.done();
        userMock.done();
        expect(resp.statusCode).to.equal(200);
        done();
      });
    });
  });

  it('responds in an invalid manner for scopes that are already in use', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob)
        // .get("/user/bigco")
        // .reply(404)
        .get("/org/bigco")
        .reply(200, fixtures.orgs.bigco)
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(200, fixtures.orgs.bigcoUsers)
        .get("/org/bigco/package?per_page=100&page=0")
        .reply(200, [])
        .get('/org/bigco/team?per_page=100&page=0')
        .reply(200, fixtures.teams.bigcoOrg);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(404);

      var options = {
        url: "/org/create/billing?orgScope=org-915001&human-name=Bob%27s%20Org%20Is%20Cool&new-user=bigco",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        expect(resp.statusCode).to.equal(302);
        expect(resp.headers.location).to.include('/org/transfer-user-name?notice=');
        expect(resp.headers.location).to.include("&orgScope=org-915001&human-name=Bob's Org Is Cool");
        done();
      });
    });
  });
});

describe('updating an org', function() {
  describe('adding a user', function() {
    it('renders a redirect if a user cannot be added to an org', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe")
          .reply(404);

        var orgMock = nock("https://user-api-example.com")
          .put('/org/bigco/user', {
            user: 'betty',
            role: 'developer'
          })
          .reply(404);

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'addUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(redirectPath).to.include('/org/bigco/members?notice=');
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('user not found');
            done();
          });
        });
      });
    });

    it('renders an error if the license of the org cannot be retrieved', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe")
          .reply(200, fixtures.customers.happy)
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, []);

        var orgMock = nock("https://user-api-example.com")
          .put('/org/bigco/user', {
            user: 'betty',
            role: 'developer'
          })
          .reply(200, {
            "created": "2015-08-05T15:26:46.970Z",
            "deleted": null,
            "org_id": 1,
            "role": "developer",
            "updated": "2015-08-05T15:26:46.970Z",
            "user_id": 15
          });

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'addUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('No license for org bigco found');
            done();
          });
        });
      });
    });

    it('renders an error if a sponsorship cannot be extended', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe")
          .reply(200, fixtures.customers.happy)
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, fixtures.orgs.bobsBigcoSubscription)
          .put("/sponsorship/1", {
            "npm_user": "betty"
          })
          .reply(404);

        var orgMock = nock("https://user-api-example.com")
          .put('/org/bigco/user', {
            user: 'betty',
            role: 'developer'
          })
          .reply(200, {
            "created": "2015-08-05T15:26:46.970Z",
            "deleted": null,
            "org_id": 1,
            "role": "developer",
            "updated": "2015-08-05T15:26:46.970Z",
            "user_id": 15
          });

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'addUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('The sponsorship license number 1 is not found');
            done();
          });
        });
      });
    });

    it('renders an error if a sponsorship cannot be accepted', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe")
          .reply(200, fixtures.customers.happy)
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, fixtures.orgs.bobsBigcoSubscription)
          .put("/sponsorship/1", {
            "npm_user": "betty"
          })
          .reply(200, {
            "created": "2015-08-05T20:55:54.759Z",
            "deleted": null,
            "id": 15,
            "license_id": 1,
            "npm_user": "betty",
            "updated": "2015-08-05T20:55:54.759Z",
            "verification_key": "f56dffef-b136-429a-97dc-57a6ef035829",
            "verified": null
          })
          .post("/sponsorship/f56dffef-b136-429a-97dc-57a6ef035829")
          .reply(404);

        var orgMock = nock("https://user-api-example.com")
          .put('/org/bigco/user', {
            user: 'betty',
            role: 'developer'
          })
          .reply(200, {
            "created": "2015-08-05T15:26:46.970Z",
            "deleted": null,
            "org_id": 1,
            "role": "developer",
            "updated": "2015-08-05T15:26:46.970Z",
            "user_id": 15
          });

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'addUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('The verification key used for accepting this sponsorship does not exist');
            done();
          });
        });
      });
    });

    it('continues successfully if the user is already paid for', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe")
          .reply(404)
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, fixtures.orgs.bobsBigcoSubscription)
          .put("/sponsorship/1", {
            "npm_user": "betty"
          })
          .reply(200, {
            "created": "2015-08-05T20:55:54.759Z",
            "deleted": null,
            "id": 15,
            "license_id": 1,
            "npm_user": "betty",
            "updated": "2015-08-05T20:55:54.759Z",
            "verification_key": "f56dffef-b136-429a-97dc-57a6ef035829",
            "verified": null
          })
          .post("/sponsorship/f56dffef-b136-429a-97dc-57a6ef035829")
          .reply(409, "duplicate key value violates unique constraint \"sponsorships_npm_user\"");

        var orgMock = nock("https://user-api-example.com")
          .put('/org/bigco/user', {
            user: 'betty',
            role: 'developer'
          })
          .reply(200, {
            "created": "2015-08-05T15:26:46.970Z",
            "deleted": null,
            "org_id": 1,
            "role": "developer",
            "updated": "2015-08-05T15:26:46.970Z",
            "user_id": 15
          });

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'addUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          expect(resp.statusCode).to.equal(302);
          expect(resp.headers.location).to.equal('/org/bigco/members');
          done();
        });
      });
    });

    it('successfully adds the user to the org', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe")
          .reply(404)
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, fixtures.orgs.bobsBigcoSubscription)
          .put("/sponsorship/1", {
            "npm_user": "betty"
          })
          .reply(200, {
            "created": "2015-08-05T20:55:54.759Z",
            "deleted": null,
            "id": 15,
            "license_id": 1,
            "npm_user": "betty",
            "updated": "2015-08-05T20:55:54.759Z",
            "verification_key": "f56dffef-b136-429a-97dc-57a6ef035829",
            "verified": null
          })
          .post("/sponsorship/f56dffef-b136-429a-97dc-57a6ef035829")
          .reply(200, {
            "created": "2015-08-05T20:59:32.707Z",
            "deleted": null,
            "id": 15,
            "license_id": 1,
            "npm_user": "betty",
            "updated": "2015-08-05T20:59:41.538Z",
            "verification_key": "f56dffef-b136-429a-97dc-57a6ef035829",
            "verified": true
          });

        var orgMock = nock("https://user-api-example.com")
          .put('/org/bigco/user', {
            user: 'betty',
            role: 'developer'
          })
          .reply(200, {
            "created": "2015-08-05T15:26:46.970Z",
            "deleted": null,
            "org_id": 1,
            "role": "developer",
            "updated": "2015-08-05T15:26:46.970Z",
            "user_id": 15
          });

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'addUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          expect(resp.statusCode).to.equal(302);
          expect(resp.headers.location).to.equal('/org/bigco/members');
          done();
        });
      });
    });
  });

  describe('removing a user', function() {
    it('renders an error if the org license cannot be retrieved', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe")
          .reply(200, fixtures.customers.happy)
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, []);

        var orgMock = nock("https://user-api-example.com")
          .delete('/org/bigco/user/betty')
          .reply(200);

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'deleteUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          orgMock.done();
          userMock.done();
          licenseMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal("No license for org bigco found");
            done();
          });
        });
      });
    });

    it('renders an error if the sponsorship cannot be revoked', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe")
          .reply(200, fixtures.customers.happy)
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, fixtures.orgs.bobsBigcoSubscription)
          .delete("/sponsorship/1/betty")
          .reply(404);

        var orgMock = nock("https://user-api-example.com")
          .delete('/org/bigco/user/betty')
          .reply(200);

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'deleteUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          orgMock.done();
          userMock.done();
          licenseMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('user or licenseId not found');
            done();
          });
        });
      });
    });

    it('renders an error if the org is unable to remove the user', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var orgMock = nock("https://user-api-example.com")
          .delete('/org/bigco/user/betty')
          .reply(404);

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'deleteUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          orgMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('org or user not found');
            done();
          });
        });
      });
    });

    it('successfully deletes the user from the organization', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var orgMock = nock("https://user-api-example.com")
          .delete('/org/bigco/user/betty')
          .reply(200, {
            "created": "2015-08-05T15:26:46.970Z",
            "deleted": "2015-08-05T15:30:46.970Z",
            "org_id": 1,
            "role": "developer",
            "updated": "2015-08-05T15:26:46.970Z",
            "user_id": 15
          });

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, fixtures.orgs.bobsBigcoSubscription)
          .delete("/sponsorship/1/betty")
          .reply(200, {
            "created": "2015-08-05T20:55:54.759Z",
            "deleted": "2015-08-05T15:30:46.970Z",
            "id": 15,
            "license_id": 1,
            "npm_user": "betty",
            "updated": "2015-08-05T20:55:54.759Z",
            "verification_key": "f56dffef-b136-429a-97dc-57a6ef035829",
            "verified": null
          });

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            role: 'developer',
            updateType: 'deleteUser',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          orgMock.done();
          licenseMock.done();
          expect(resp.statusCode).to.equal(302);
          expect(resp.headers.location).to.equal('/org/bigco/members');
          done();
        });
      });
    });
  });

  describe('updating paid status of user', function() {
    it('adds paid for status when prompted', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var orgMock = nock("https://user-api-example.com")
          .get('/org/bigco')
          .reply(200);

        var licenseMock = nock("https://license-api-example.com:443")
          .get("/customer/bob/stripe")
          .reply(200)
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, fixtures.orgs.bobsBigcoSubscription)
          .put("/sponsorship/1", {
            "npm_user": "betty"
          })
          .reply(200, {
            "id": 15,
            "npm_user": "betty",
            "created": "2015-08-05T20:55:54.759Z",
            "updated": "2015-08-05T20:55:54.759Z",
            "deleted": null,
            "verification_key": "f56dffef-b136-429a-97dc-57a6ef035829",
            "verified": null
          })
          .post("/sponsorship/f56dffef-b136-429a-97dc-57a6ef035829")
          .reply(200, {
            "id": 15,
            "npm_user": "betty",
            "created": "2015-08-05T20:55:54.759Z",
            "updated": "2015-08-05T20:55:54.759Z",
            "deleted": null,
            "verification_key": "f56dffef-b136-429a-97dc-57a6ef035829",
            "verified": true
          });

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            payStatus: 'on',
            updateType: 'updatePayStatus',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };


        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          expect(resp.statusCode).to.equal(302);
          expect(resp.headers.location).to.equal('/org/bigco/members');
          done();
        });
      });
    });

    it('removes paid for status when prompted', function(done) {
      generateCrumb(server, function(crumb) {
        var userMock = nock("https://user-api-example.com")
          .get("/user/bob")
          .reply(200, fixtures.users.bob);

        var orgMock = nock("https://user-api-example.com")
          .get('/org/bigco')
          .reply(200);

        var licenseMock = nock("https://license-api-example.com")
          .get("/customer/bob/stripe")
          .reply(404)
          .get("/customer/bob/stripe/subscription?org=bigco")
          .reply(200, fixtures.orgs.bobsBigcoSubscription)
          .delete("/sponsorship/1/betty")
          .reply(200, {
            "created": "2015-08-05T20:55:54.759Z",
            "deleted": "2015-08-05T15:30:46.970Z",
            "id": 15,
            "license_id": 1,
            "npm_user": "betty",
            "updated": "2015-08-05T20:55:54.759Z",
            "verification_key": "f56dffef-b136-429a-97dc-57a6ef035829",
            "verified": null
          });

        var options = {
          url: "/org/bigco",
          method: "post",
          credentials: fixtures.users.bob,
          payload: {
            username: 'betty',
            updateType: 'updatePayStatus',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          expect(resp.statusCode).to.equal(302);
          expect(resp.headers.location).to.equal('/org/bigco/members');
          done();
        });
      });
    });
  });
});

describe('deleting an org', function() {
  it('redirects to billing page with an error when the org name is invalid', function(done) {

    var userMock = nock("https://user-api-example.com")
      .get("/user/bob")
      .reply(200, fixtures.users.bob);

    generateCrumb(server, function(crumb) {
      var options = {
        url: "/org/bigco_aoi&&",
        method: "POST",
        payload: {
          updateType: "deleteOrg",
          crumb: crumb,
        },
        credentials: fixtures.users.bob,
        headers: {
          cookie: 'crumb=' + crumb
        }
      };

      server.inject(options, function(resp) {
        userMock.done();
        var redirectPath = resp.headers.location;
        var url = URL.parse(redirectPath);
        var query = url.query;
        var token = qs.parse(query).notice;
        var tokenFacilitator = new TokenFacilitator({
          redis: client
        });
        expect(redirectPath).to.include('/settings/billing');
        expect(token).to.be.string();
        expect(token).to.not.be.empty();
        expect(resp.statusCode).to.equal(302);
        tokenFacilitator.read(token, {
          prefix: "notice:"
        }, function(err, notice) {
          expect(err).to.not.exist();
          expect(notice.notices).to.be.array();
          expect(notice.notices[0].notice).to.equal('Org Scope must be valid name');
          done();
        });
      });
    });
  });

  it('redirects to billing page when an org is to be deleted', function(done) {
    generateCrumb(server, function(crumb) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription")
        .reply(200, fixtures.orgs.bobsOrgSubscriptions)
        .get("/customer/bob/stripe")
        .reply(404)
        .delete("/customer/bob/stripe/subscription/sub_12346")
        .reply(200, {
          "id": "sub_12346",
          "current_period_end": 1439766874,
          "current_period_start": 1437088474,
          "quantity": 2,
          "status": "active",
          "interval": "month",
          "amount": 700,
          "license_id": 1,
          "npm_org": "bigco",
          "npm_user": "bob",
          "product_id": "1031405a-70b7-4a3f-b557-8609d9e1428a"
        });

      var options = {
        url: "/org/bigco",
        method: "POST",
        payload: {
          updateType: "deleteOrg",
          crumb: crumb,
        },
        credentials: fixtures.users.bob,
        headers: {
          cookie: 'crumb=' + crumb
        }
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        var redirectPath = resp.headers.location;
        var url = URL.parse(redirectPath);
        var query = url.query;
        var token = qs.parse(query).notice;
        var tokenFacilitator = new TokenFacilitator({
          redis: client
        });
        expect(redirectPath).to.include('/settings/billing');
        expect(token).to.be.string();
        expect(token).to.not.be.empty();
        expect(resp.statusCode).to.equal(302);
        tokenFacilitator.read(token, {
          prefix: "notice:"
        }, function(err, notice) {
          expect(err).to.not.exist();
          expect(notice.notices).to.be.array();
          expect(notice.notices[0].notice).to.equal('You will no longer be billed for @bigco.');
          done();
        });
      });
    });
  });

  describe('getting a user', function() {
    it('returns a 404 error if the user is not in the org', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get('/org/bigco/user?per_page=100&page=0')
        .reply(200, fixtures.orgs.bigcoUsers);

      var options = {
        url: "/org/bigco/user?member=betty",
        method: "GET",
        credentials: fixtures.users.bob,
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        expect(resp.statusCode).to.equal(404);
        done();
      });
    });

    it('returns a 404 error if the org does not exist', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get('/org/bigco/user?per_page=100&page=0')
        .reply(404);

      var options = {
        url: "/org/bigco/user?member=betty",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        expect(resp.statusCode).to.equal(404);
        done();
      });
    });

    it('returns a 200 if the user is a member', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get('/org/bigco/user?per_page=100&page=0')
        .reply(200, fixtures.orgs.bigcoUsers);

      var options = {
        url: "/org/bigco/user?member=bob",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        expect(resp.statusCode).to.equal(200);
        done();
      });
    });
  });

  describe('org delete confirmation', function() {
    it('returns a 404 error if the org does not exist', function(done) {
      nock.disableNetConnect();

      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var options = {
        url: "/org/bigco/confirm-delete",
        method: "GET",
        credentials: fixtures.users.bob,
      };

      server.inject(options, function(resp) {
        expect(resp.statusCode).to.equal(404);
        userMock.done();
        done();
      });
    });

    it('links to the delete page if there', function(done) {
      nock.disableNetConnect();

      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe")
        .reply(200, fixtures.customers.happy)
        .get("/customer/bob/stripe/subscription")
        .reply(200, fixtures.users.bobsubscriptions)

      var options = {
        url: "/org/bigco/confirm-delete",
        method: "GET",
        credentials: fixtures.users.bob,
      };

      server.inject(options, function(resp) {
        expect(resp.statusCode).to.equal(200);
        expect(resp.payload).to.match(/bigco/);
        expect(resp.payload).to.match(/deleteOrg/);
        userMock.done();
        licenseMock.done();
        done();
      });
    });
  });
});

describe('restarting an org', function() {

  describe('restarting a licensed org for a current customer', function() {
    it('redirects with an error if org does not exist', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco")
        .reply(404);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, []);

      generateCrumb(server, function(crumb) {
        var options = {
          url: "/org/bigco",
          method: "POST",
          payload: {
            updateType: 'restartOrg',
            crumb: crumb
          },
          credentials: fixtures.users.bob,
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(redirectPath).to.include('/settings/billing');
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('Org not found');
            done();
          });
        });
      });
    });

    it('redirects to restart page if license for org does not exist', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco")
        .reply(200);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, []);

      generateCrumb(server, function(crumb) {
        var options = {
          url: "/org/bigco",
          method: "POST",
          payload: {
            updateType: 'restartOrg',
            crumb: crumb
          },
          credentials: fixtures.users.bob,
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          expect(resp.statusCode).to.equal(302);
          var redirectPath = resp.headers.location;
          expect(redirectPath).to.equal("/org/bigco/restart-license");
          done();
        });
      });
    });

    it('redirects to restart page if customer does not exist but org does', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco")
        .reply(200);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(404);

      generateCrumb(server, function(crumb) {
        var options = {
          url: "/org/bigco",
          method: "POST",
          payload: {
            updateType: 'restartOrg',
            crumb: crumb
          },
          credentials: fixtures.users.bob,
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          expect(resp.statusCode).to.equal(302);
          var redirectPath = resp.headers.location;
          expect(redirectPath).to.equal("/org/bigco/restart");
          done();
        });
      });
    });

    it('redirects to billing page if customer does not exist and org does not either', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco")
        .reply(404);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(404);

      generateCrumb(server, function(crumb) {
        var options = {
          url: "/org/bigco",
          method: "POST",
          payload: {
            updateType: 'restartOrg',
            crumb: crumb
          },
          credentials: fixtures.users.bob,
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          expect(resp.statusCode).to.equal(302);
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(redirectPath).to.include('/settings/billing');
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('Org not found');
            done();
          });
        });
      });
    });

    it('redirects to the org if it successfully restarts payment', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco")
        .reply(200);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, fixtures.orgs.bobsBigcoSubscription)
        .get("/sponsorship/1")
        .reply(200, [
          {
            "created": "2015-09-02T19:38:57.390Z",
            "deleted": null,
            "id": 28,
            "license_id": 1,
            "npm_user": "bob",
            "updated": "2015-09-02T19:38:57.487Z",
            "verification_key": "9d295e2c",
            "verified": true
          },
          {
            "created": "2015-09-02T19:39:24.644Z",
            "deleted": null,
            "id": 267,
            "license_id": 1,
            "npm_user": "betty",
            "updated": "2015-09-02T19:39:24.757Z",
            "verification_key": "64b8e949",
            "verified": true
          }
        ])
        .delete("/customer/bob/stripe/subscription/sub_abcd")
        .reply(200, {
          "id": "sub_abcd",
          "current_period_end": 1439766874,
          "current_period_start": 1437088474,
          "quantity": 2,
          "status": "active",
          "interval": "month",
          "amount": 700,
          "license_id": 17,
          "npm_org": "bigco",
          "npm_user": "bob",
          "product_id": "1031405a-70b7-4a3f-b557-8609d9e1428a",
          "cancel_at_period_end": true
        })
        .put("/customer/bob/stripe/subscription", {
          npm_org: "bigco",
          plan: "npm-paid-org-7",
          quantity: 2
        })
        .reply(200, {
          "amount": 700,
          "cancel_at_period_end": false,
          "current_period_end": 1451853472,
          "current_period_start": 1449175072,
          "id": "sub_7Sz",
          "interval": "month",
          "license_id": 28,
          "npm_org": "bigco",
          "npm_user": "bob",
          "product_id": "b5822d32",
          "quantity": 2,
          "status": "active"
        })
        .put("/sponsorship/28", {
          npm_user: "bob"
        })
        .reply(200, {
          "created": "2015-12-03T21:54:17.673Z",
          "deleted": null,
          "id": 28,
          "license_id": 1,
          "npm_user": "bob",
          "updated": "2015-12-03T21:54:17.673Z",
          "verification_key": "3839ff7d",
          "verified": null
        })
        .delete("/sponsorship/1/bob")
        .reply(200, {
          "created": "2015-12-03T21:54:17.673Z",
          "deleted": "2016-01-03T21:54:17.673Z",
          "id": 58,
          "license_id": 28,
          "npm_user": "bob",
          "updated": "2015-12-03T21:54:17.673Z",
          "verification_key": "9d295e2c",
          "verified": null
        })
        .post("/sponsorship/3839ff7d")
        .reply(200, {
          id: 59,
          npm_user: "bob",
          created: "2015-12-03T21:54:17.673Z",
          updated: "2015-12-03T21:54:17.673Z",
          deleted: null,
          verified: true
        })
        .put("/sponsorship/28", {
          npm_user: "betty"
        })
        .reply(200, {
          "created": "2015-12-03T21:54:17.673Z",
          "deleted": null,
          "id": 28,
          "license_id": 211,
          "npm_user": "betty",
          "updated": "2015-12-03T21:54:17.673Z",
          "verification_key": "3839f888",
          "verified": null
        })
        .delete("/sponsorship/1/betty")
        .reply(200, {
          "created": "2015-09-02T19:39:24.644Z",
          "deleted": "2016-01-03T21:54:17.673Z",
          "id": 267,
          "license_id": 1,
          "npm_user": "betty",
          "updated": "2015-09-02T19:39:24.757Z",
          "verification_key": "64b8e949",
          "verified": null
        })
        .post("/sponsorship/3839f888")
        .reply(200, {
          "id": 268,
          "npm_user": "betty",
          "created": "2015-12-03T21:54:17.673Z",
          "updated": "2015-12-03T21:54:17.673Z",
          "deleted": null,
          "verified": true
        });


      generateCrumb(server, function(crumb) {
        var options = {
          url: "/org/bigco",
          method: "POST",
          payload: {
            updateType: 'restartOrg',
            crumb: crumb
          },
          credentials: fixtures.users.bob,
          headers: {
            cookie: 'crumb=' + crumb
          }
        };

        server.inject(options, function(resp) {
          userMock.done();
          licenseMock.done();
          orgMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(redirectPath).to.include('/org/bigco');
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('You have successfully restarted payment for bigco');
            done();
          });
        });
      });
    });
  });

  describe('accessing the restart page for a current customer and an unlicensed org', function() {
    it('redirects if org does not exist', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(404);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, []);

      var options = {
        url: "/org/bigco/restart-license",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        licenseMock.done();
        var redirectPath = resp.headers.location;
        var url = URL.parse(redirectPath);
        var query = url.query;
        var token = qs.parse(query).notice;
        var tokenFacilitator = new TokenFacilitator({
          redis: client
        });
        expect(redirectPath).to.include('/settings/billing');
        expect(token).to.be.string();
        expect(token).to.not.be.empty();
        expect(resp.statusCode).to.equal(302);
        tokenFacilitator.read(token, {
          prefix: "notice:"
        }, function(err, notice) {
          expect(err).to.not.exist();
          expect(notice.notices).to.be.array();
          expect(notice.notices[0].notice).to.equal('org not found');
          done();
        });
      });
    });

    it('redirects if org and license exist', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(200);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, [{}]);

      var options = {
        url: "/org/bigco/restart-license",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        licenseMock.done();
        var redirectPath = resp.headers.location;
        var url = URL.parse(redirectPath);
        var query = url.query;
        var token = qs.parse(query).notice;
        var tokenFacilitator = new TokenFacilitator({
          redis: client
        });
        expect(redirectPath).to.include('/settings/billing');
        expect(token).to.be.string();
        expect(token).to.not.be.empty();
        expect(resp.statusCode).to.equal(302);
        tokenFacilitator.read(token, {
          prefix: "notice:"
        }, function(err, notice) {
          expect(err).to.not.exist();
          expect(notice.notices).to.be.array();
          expect(notice.notices[0].notice).to.equal('The license for bigco already exists.');
          done();
        });
      });

    });

    it('redirects if org exists, license does not, but user is not a super-admin in the org', function(done) {

      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(200);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, []);

      var options = {
        url: "/org/bigco/restart-license",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        licenseMock.done();
        var redirectPath = resp.headers.location;
        var url = URL.parse(redirectPath);
        var query = url.query;
        var token = qs.parse(query).notice;
        var tokenFacilitator = new TokenFacilitator({
          redis: client
        });
        expect(redirectPath).to.include('/settings/billing');
        expect(token).to.be.string();
        expect(token).to.not.be.empty();
        expect(resp.statusCode).to.equal(302);
        tokenFacilitator.read(token, {
          prefix: "notice:"
        }, function(err, notice) {
          expect(err).to.not.exist();
          expect(notice.notices).to.be.array();
          expect(notice.notices[0].notice).to.equal('bob does not have permission to view this page');
          done();
        });
      });

    });

    it('successfully accesses the page if the org exists, the license does not, and the user is the super-admin of the org', function(done) {

      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(200, fixtures.orgs.bigcoUsers);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, []);

      var options = {
        url: "/org/bigco/restart-license",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        licenseMock.done();
        expect(resp.statusCode).to.equal(200);
        done();
      });
    });

  });

  describe('accessing the restart page for a non-customer and an unlicensed org', function() {
    it('goes to error page if the org does not exist', function(done) {

      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(404, 'Org not found');

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(404);

      var options = {
        url: "/org/bigco/restart",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        licenseMock.done();
        expect(resp.statusCode).to.equal(404);
        done();
      });
    });

    it('redirects if the user is a current customer', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, []);

      var options = {
        url: "/org/bigco/restart",
        method: "GET",
        credentials: fixtures.users.bob
      };

      server.inject(options, function(resp) {
        userMock.done();
        licenseMock.done();
        var redirectPath = resp.headers.location;
        var url = URL.parse(redirectPath);
        var query = url.query;
        var token = qs.parse(query).notice;
        var tokenFacilitator = new TokenFacilitator({
          redis: client
        });
        expect(redirectPath).to.include('/settings/billing');
        expect(token).to.be.string();
        expect(token).to.not.be.empty();
        expect(resp.statusCode).to.equal(302);
        tokenFacilitator.read(token, {
          prefix: "notice:"
        }, function(err, notice) {
          expect(err).to.not.exist();
          expect(notice.notices).to.be.array();
          expect(notice.notices[0].notice).to.equal('Customer exists');
          done();
        });
      });
    });
    it('redirects if the user is a non-customer and the org exists, unlicensed, but the user is not the super-admin', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/betty")
        .reply(200, fixtures.users.betty);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(200, fixtures.orgs.bigcoAddedUsers);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/betty/stripe/subscription?org=bigco")
        .reply(404);

      var options = {
        url: "/org/bigco/restart",
        method: "GET",
        credentials: fixtures.users.betty
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        licenseMock.done();
        var redirectPath = resp.headers.location;
        var url = URL.parse(redirectPath);
        var query = url.query;
        var token = qs.parse(query).notice;
        var tokenFacilitator = new TokenFacilitator({
          redis: client
        });
        expect(redirectPath).to.include('/settings/billing');
        expect(token).to.be.string();
        expect(token).to.not.be.empty();
        expect(resp.statusCode).to.equal(302);
        tokenFacilitator.read(token, {
          prefix: "notice:"
        }, function(err, notice) {
          expect(err).to.not.exist();
          expect(notice.notices).to.be.array();
          expect(notice.notices[0].notice).to.equal('betty does not have permission to view this page');
          done();
        });
      });
    });

    it('successfully allows user to access page if the user is a non-customer and the org exists, unlicensed, and the user is the super-admin of the org', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bill")
        .reply(200, fixtures.users.bill);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(200, fixtures.orgs.bigcoAddedUsers);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bill/stripe/subscription?org=bigco")
        .reply(404);

      var options = {
        url: "/org/bigco/restart",
        method: "GET",
        credentials: fixtures.users.bill
      };

      server.inject(options, function(resp) {
        userMock.done();
        orgMock.done();
        licenseMock.done();
        expect(resp.statusCode).to.equal(200);
        expect(resp.request.response.source.template).to.equal('org/restart-subscription');
        done();
      });
    });

  });

  describe('restarting an unlicensed org for a current customer', function() {
    it('redirects if org does not exist', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(404);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, []);

      generateCrumb(server, function(crumb) {
        var options = {
          url: "/org/bigco",
          method: "POST",
          payload: {
            updateType: 'restartUnlicensedOrg',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          },
          credentials: fixtures.users.bob
        };

        server.inject(options, function(resp) {
          userMock.done();
          orgMock.done();
          licenseMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(redirectPath).to.include('/settings/billing');
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('org not found');
            done();
          });
        });
      });
    });

    it('redirects if org and license exist', function(done) {
      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(200);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, [{}]);

      generateCrumb(server, function(crumb) {
        var options = {
          url: "/org/bigco",
          method: "POST",
          payload: {
            updateType: 'restartUnlicensedOrg',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          },
          credentials: fixtures.users.bob
        };

        server.inject(options, function(resp) {
          userMock.done();
          orgMock.done();
          licenseMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(redirectPath).to.include('/settings/billing');
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('The license for bigco already exists.');
            done();
          });
        });
      });

    });

    it('redirects if org exists, license does not, but user is a super-admin in the org', function(done) {

      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(200);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, []);

      generateCrumb(server, function(crumb) {
        var options = {
          url: "/org/bigco",
          method: "POST",
          payload: {
            updateType: 'restartUnlicensedOrg',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          },
          credentials: fixtures.users.bob
        };

        server.inject(options, function(resp) {
          userMock.done();
          orgMock.done();
          licenseMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(redirectPath).to.include('/settings/billing');
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('bob does not have permission to restart this organization');
            done();
          });
        });
      });

    });

    it('successfully restarts an unlicensed org', function(done) {

      var userMock = nock("https://user-api-example.com")
        .get("/user/bob")
        .reply(200, fixtures.users.bob);

      var orgMock = nock("https://user-api-example.com")
        .get("/org/bigco/user?per_page=100&page=0")
        .reply(200, fixtures.orgs.bigcoUsers);

      var licenseMock = nock("https://license-api-example.com")
        .get("/customer/bob/stripe/subscription?org=bigco")
        .reply(200, [])
        .put("/customer/bob/stripe/subscription", {
          "npm_org": "bigco",
          "plan": "npm-paid-org-7",
          "quantity": 2
        })
        .reply(200, {
          "amount": 700,
          "cancel_at_period_end": false,
          "current_period_end": 1451853499,
          "current_period_start": 1449175099,
          "id": "sub_7Sz",
          "interval": "month",
          "license_id": 281,
          "npm_org": "bigco",
          "npm_user": "bob",
          "product_id": "b5822d32",
          "quantity": 2,
          "status": "active"
        })
        .put("/sponsorship/281", {
          "npm_user": "bob"
        })
        .reply(200, {
          "created": "2016-01-10T20:55:54.759Z",
          "deleted": null,
          "id": 158,
          "license_id": 12,
          "npm_user": "bob",
          "updated": "2016-01-10T20:55:54.759Z",
          "verification_key": "f56dffef-b136-429a-97dc",
          "verified": null
        })
        .post("/sponsorship/f56dffef-b136-429a-97dc")
        .reply(200, {
          "created": "2016-01-10T20:55:54.759Z",
          "deleted": null,
          "id": 158,
          "license_id": 12,
          "npm_user": "bob",
          "updated": "2016-01-10T20:56:02.759Z",
          "verification_key": "f56dffef-b136-429a-97dc",
          "verified": true
        });

      generateCrumb(server, function(crumb) {
        var options = {
          url: "/org/bigco",
          method: "POST",
          payload: {
            updateType: 'restartUnlicensedOrg',
            crumb: crumb
          },
          headers: {
            cookie: 'crumb=' + crumb
          },
          credentials: fixtures.users.bob
        };

        server.inject(options, function(resp) {
          userMock.done();
          orgMock.done();
          licenseMock.done();
          var redirectPath = resp.headers.location;
          var url = URL.parse(redirectPath);
          var query = url.query;
          var token = qs.parse(query).notice;
          var tokenFacilitator = new TokenFacilitator({
            redis: client
          });
          expect(redirectPath).to.include('/org/bigco');
          expect(token).to.be.string();
          expect(token).to.not.be.empty();
          expect(resp.statusCode).to.equal(302);
          tokenFacilitator.read(token, {
            prefix: "notice:"
          }, function(err, notice) {
            expect(err).to.not.exist();
            expect(notice.notices).to.be.array();
            expect(notice.notices[0].notice).to.equal('You have successfully restarted bigco');
            done();
          });
        });
      });

    });

  });
});
